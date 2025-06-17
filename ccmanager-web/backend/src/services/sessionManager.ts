import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { ApiKeyManager } from './apiKeyManager';
import { SessionHistoryManager } from '../database/sessionHistory';
import { filterTerminalOutput, containsProblematicSequences } from '../utils/terminalFilter';

const execAsync = promisify(exec);

export interface SessionConfig {
  userId: string;
  workingDir?: string;
  command?: string;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
  sessionId?: string; // Optional: for recreating sessions with same ID
}

export interface PTYSession {
  id: string;
  userId: string;
  pty: pty.IPty;
  workingDir: string;
  command: string;
  buffer: string[];
  bufferSize: number;
  createdAt: Date;
  lastActivity: Date;
  pid: number;
}

export interface SessionInfo {
  id: string;
  userId: string;
  workingDir: string;
  command: string;
  createdAt: Date;
  lastActivity: Date;
  pid: number;
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, PTYSession>();
  private userSessionCounts = new Map<string, number>();
  private readonly MAX_SESSIONS_PER_USER = 20;
  private readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly BUFFER_TRIM_SIZE = 8 * 1024 * 1024; // Trim to 8MB when exceeding max
  private apiKeyManager: ApiKeyManager;
  private sessionHistoryManager?: SessionHistoryManager;
  private tmuxPrefix = 'ccmanager_';
  private useTmux = true; // Enable tmux by default

  constructor(apiKeyManager: ApiKeyManager, sessionHistoryManager?: SessionHistoryManager) {
    super();
    this.apiKeyManager = apiKeyManager;
    this.sessionHistoryManager = sessionHistoryManager;
    
    // Initialize tmux if enabled
    if (this.useTmux) {
      this.initializeTmux();
    }
  }
  
  private async initializeTmux(): Promise<void> {
    try {
      // Check if tmux is installed
      execSync('which tmux', { stdio: 'ignore' });
      logger.info('Tmux is available, will use for session persistence');
      
      // List existing tmux sessions on startup
      const existingSessions = await this.listTmuxSessions();
      logger.info(`Found ${existingSessions.length} existing tmux sessions`);
      
      // Restore session info from database for existing tmux sessions
      for (const tmuxSession of existingSessions) {
        if (this.sessionHistoryManager) {
          const dbSession = await this.sessionHistoryManager.getSession(tmuxSession.id);
          if (dbSession && dbSession.status === 'active') {
            // Create a placeholder session object
            const session: PTYSession = {
              id: tmuxSession.id,
              userId: dbSession.user_id,
              pty: null as any, // Will be created when attached
              workingDir: dbSession.working_dir,
              command: dbSession.command,
              buffer: [],
              bufferSize: 0,
              createdAt: new Date(dbSession.created_at),
              lastActivity: new Date(dbSession.last_activity),
              pid: 0 // Will be updated when attached
            };
            
            this.sessions.set(tmuxSession.id, session);
            logger.info(`Restored tmux session ${tmuxSession.id} from database`);
          }
        }
      }
    } catch (error) {
      logger.warn('Tmux not available, sessions will not persist across restarts');
      this.useTmux = false;
    }
  }
  
  private async listTmuxSessions(): Promise<Array<{ id: string; name: string; created: string }>> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_created}"');
      
      return stdout
        .trim()
        .split('\n')
        .filter(line => line.startsWith(this.tmuxPrefix))
        .map(line => {
          const [name, created] = line.split(':');
          return {
            id: name.replace(this.tmuxPrefix, ''),
            name,
            created
          };
        });
    } catch (error: any) {
      if (error.message.includes('no server running')) {
        return [];
      }
      throw error;
    }
  }
  
  private async tmuxSessionExists(sessionId: string): Promise<boolean> {
    const sessions = await this.listTmuxSessions();
    return sessions.some(s => s.id === sessionId);
  }
  
  private async killTmuxSession(sessionId: string): Promise<void> {
    const tmuxName = `${this.tmuxPrefix}${sessionId}`;
    try {
      await execAsync(`tmux kill-session -t ${tmuxName}`);
    } catch (error) {
      // Session might already be dead
    }
  }
  
  private async reattachTmuxSession(sessionId: string): Promise<pty.IPty | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.pty) {
      return session?.pty || null;
    }

    const tmuxName = `${this.tmuxPrefix}${sessionId}`;
    
    try {
      logger.info(`Reattaching to tmux session ${tmuxName}`);
      
      // Check if session is already attached elsewhere
      const { stdout: sessionInfo } = await execAsync(`tmux list-sessions -F "#{session_name}:#{session_attached}" | grep "^${tmuxName}:" || echo "${tmuxName}:0"`);
      const isAttached = sessionInfo.trim().endsWith(':1');
      
      if (isAttached) {
        logger.info(`Tmux session ${tmuxName} is already attached elsewhere, will detach other clients`);
      }
      
      // Create PTY that attaches to existing tmux session with -d flag to detach other clients
      const ptyProcess = pty.spawn('tmux', ['attach-session', '-d', '-t', tmuxName], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          // Disable automatic terminal queries to prevent loops
          DISABLE_AUTO_TITLE: 'true'
        } as { [key: string]: string }
      });
      
      logger.info(`Created PTY process ${ptyProcess.pid} for tmux session ${tmuxName}`);
      
      session.pty = ptyProcess;
      session.pid = ptyProcess.pid || 0;
      
      // Add a small delay to let tmux settle after detaching other clients
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set up data handler
      ptyProcess.onData((data: string) => {
        logger.debug(`PTY onData called for session ${sessionId}, data length: ${data.length}`);
        // Filter problematic sequences if detected
        let filteredData = data;
        if (containsProblematicSequences(data)) {
          logger.debug(`Filtering problematic escape sequences from tmux session ${sessionId}`);
          filteredData = filterTerminalOutput(data);
        }
        
        this.appendToBuffer(session, filteredData);
        session.lastActivity = new Date();
        logger.debug(`Emitting sessionData event for session ${sessionId}, data length: ${filteredData.length}`);
        this.emit('sessionData', { sessionId, data: filteredData });
        
        // Store output in database
        if (this.sessionHistoryManager) {
          this.sessionHistoryManager.appendOutput(sessionId, filteredData, 'output').catch(error => {
            logger.error(`Failed to store output in database: ${error.message}`);
          });
        }
      });
      
      // Set up exit handler
      ptyProcess.onExit(({ exitCode }) => {
        logger.info(`Tmux session ${sessionId} exited with code ${exitCode}`);
        this.destroySession(sessionId, exitCode);
      });
      
      logger.info(`Successfully reattached to tmux session ${tmuxName}`);
      
      // Send a refresh command to ensure tmux sends current screen content
      // Use tmux send-keys to send Ctrl+L to the session
      setTimeout(async () => {
        try {
          logger.debug(`Sending refresh command to tmux session ${tmuxName}`);
          await execAsync(`tmux send-keys -t ${tmuxName} C-l`);
        } catch (err) {
          logger.debug(`Could not send refresh command: ${err}`);
        }
      }, 200);
      
      return ptyProcess;
    } catch (error: any) {
      logger.error(`Failed to reattach to tmux session ${tmuxName}: ${error.message}`);
      return null;
    }
  }

  private async getTmuxBuffer(sessionId: string, lines: number = 5000): Promise<string> {
    const tmuxName = `${this.tmuxPrefix}${sessionId}`;
    try {
      // Use -e flag to include escape sequences and -J flag to join wrapped lines
      const { stdout } = await execAsync(`tmux capture-pane -t ${tmuxName} -p -e -J -S -${lines}`);
      
      // Filter out tmux status lines (they typically appear at the bottom)
      // Tmux status lines are repeated when the terminal is scrolled
      const outputLines = stdout.split('\n');
      const filteredLines: string[] = [];
      const statusLinePattern = /^\[ccmanager@[\w\-]+:\s*\d+:\d+\s*"docker-\d+"\s*\d+:\d+\s+\d+-\w+-\d+\]$/;
      
      // Track seen status lines to remove duplicates
      const seenStatusLines = new Set<string>();
      
      for (let i = 0; i < outputLines.length; i++) {
        const line = outputLines[i];
        
        // Check if this is a tmux status line
        if (statusLinePattern.test(line.trim())) {
          // Only keep the first occurrence of each unique status line
          if (!seenStatusLines.has(line)) {
            seenStatusLines.add(line);
            // Only add if it's at the very end (last non-empty line)
            const remainingLines = outputLines.slice(i + 1).filter(l => l.trim().length > 0);
            if (remainingLines.length === 0) {
              filteredLines.push(line);
            }
          }
        } else {
          filteredLines.push(line);
        }
      }
      
      // Join lines and filter any remaining problematic sequences
      let result = filteredLines.join('\n');
      if (containsProblematicSequences(result)) {
        result = filterTerminalOutput(result);
      }
      return result;
    } catch (error) {
      return '';
    }
  }

  async recreateSession(config: SessionConfig & { sessionId: string }): Promise<string> {
    // Similar to createSession but uses provided sessionId
    const sessionId = config.sessionId;
    
    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      logger.warn(`Session ${sessionId} already exists`);
      return sessionId;
    }

    return this.createSessionInternal({ ...config, sessionId });
  }

  async createSession(config: SessionConfig): Promise<string> {
    return this.createSessionInternal(config);
  }

  private async createSessionInternal(config: SessionConfig): Promise<string> {
    const { userId, workingDir = process.cwd(), command = process.env.CLAUDE_COMMAND || 'claude', cols = 80, rows = 24, onData, onExit } = config;

    // Check user session limit
    const userSessionCount = this.userSessionCounts.get(userId) || 0;
    if (userSessionCount >= this.MAX_SESSIONS_PER_USER) {
      throw new Error('Maximum session limit reached');
    }

    const sessionId = config.sessionId || this.generateSessionId();
    
    try {
      // Validate working directory exists
      if (!fs.existsSync(workingDir)) {
        logger.error(`Working directory does not exist: ${workingDir}`);
        throw new Error(`Working directory does not exist: ${workingDir}`);
      }
      
      // Check if directory is accessible
      try {
        fs.accessSync(workingDir, fs.constants.R_OK | fs.constants.X_OK);
      } catch (err) {
        logger.error(`Working directory is not accessible: ${workingDir}`);
        throw new Error(`Working directory is not accessible: ${workingDir}`);
      }
      
      // Parse command and args if they're combined
      let actualCommand = command;
      let commandArgs: string[] = [];
      
      if (command.includes(' ')) {
        const parts = command.split(' ');
        actualCommand = parts[0];
        commandArgs = parts.slice(1);
      }
      
      // Fix common issues: uppercase command and em dash
      actualCommand = actualCommand.toLowerCase();
      commandArgs = commandArgs.map(arg => arg.replace(/—/g, '--'));
      
      // Check if command exists
      try {
        execSync(`which ${actualCommand}`, { stdio: 'ignore' });
      } catch (err) {
        logger.error(`Command not found in PATH: ${actualCommand}`);
        throw new Error(`Command not found: ${actualCommand}. Please ensure it is installed and in your PATH.`);
      }
      
      // Don't require API key - Claude uses OAuth
      // const apiKey = await this.getUserApiKey(userId);
      
      // Add additional args from environment
      const envArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : [];
      const args = [...commandArgs, ...envArgs];
      
      logger.info(`Creating PTY session with command: ${actualCommand} ${args.join(' ')}, cwd: ${workingDir}`);
      logger.info(`Actual command args:`, args);
      
      let ptyProcess: pty.IPty;
      
      if (this.useTmux) {
        // Create tmux session
        const tmuxName = `${this.tmuxPrefix}${sessionId}`;
        const tmuxCommand = args.length > 0 
          ? `${actualCommand} ${args.join(' ')}`
          : actualCommand;
        
        try {
          // Create detached tmux session
          // For dev server commands, wrap in bash and keep session alive after command exits
          let sessionCommand = tmuxCommand;
          if (command.includes('npm') || command.includes('yarn') || command.includes('pnpm') || 
              command.includes('dev') || command.includes('start') || command.includes('.sh')) {
            // Keep the session alive after the dev server exits
            sessionCommand = `bash -c "${tmuxCommand}; echo ''; echo '=========================================='; echo 'Process exited. Press Enter to close or run commands...'; exec bash"`;
          }
          
          await execAsync(
            `tmux new-session -d -s ${tmuxName} -c "${workingDir}" -x ${cols} -y ${rows} "${sessionCommand}"`
          );
          logger.info(`Created tmux session: ${tmuxName} with command: ${sessionCommand}`);
          
          // Attach to tmux session via PTY with -d flag to detach other clients
          logger.info(`Attaching to tmux session ${tmuxName} via PTY (detaching other clients)`);
          ptyProcess = pty.spawn('tmux', ['attach-session', '-d', '-t', tmuxName], {
            name: 'xterm-256color',
            cols: cols,
            rows: rows,
            cwd: workingDir,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              // Disable automatic terminal queries to prevent loops
              DISABLE_AUTO_TITLE: 'true'
            } as { [key: string]: string }
          });
          
          // Add a small delay to let tmux settle after creating new session
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          logger.error(`Failed to create tmux session: ${error.message}`);
          throw new Error(`Failed to create tmux session: ${error.message}`);
        }
      } else {
        // Regular PTY without tmux
        ptyProcess = pty.spawn(actualCommand, args, {
          name: 'xterm-256color',
          cols: cols,
          rows: rows,
          cwd: workingDir,
          env: {
            ...process.env,
            CCMANAGER_SESSION_ID: sessionId,
          } as { [key: string]: string }
        });
      }

      const session: PTYSession = {
        id: sessionId,
        userId,
        pty: ptyProcess,
        workingDir,
        command,
        buffer: [],
        bufferSize: 0,
        createdAt: new Date(),
        lastActivity: new Date(),
        pid: ptyProcess.pid
      };

      // Collect initial output for error diagnosis
      let initialOutput = '';
      let outputTimer: NodeJS.Timeout;
      
      // Handle PTY output
      ptyProcess.onData((data: string) => {
        // Filter problematic sequences if detected
        let filteredData = data;
        if (containsProblematicSequences(data)) {
          logger.debug(`Filtering problematic escape sequences from session ${sessionId}`);
          filteredData = filterTerminalOutput(data);
        }
        
        session.lastActivity = new Date();
        this.appendToBuffer(session, filteredData);
        onData(filteredData);
        logger.debug(`Emitting sessionData event for session ${sessionId}, data length: ${filteredData.length}`);
        this.emit('sessionData', { sessionId, data: filteredData });
        
        // Collect initial output for debugging
        if (initialOutput.length < 1000) {
          initialOutput += filteredData;
        }
        
        // Store output in database
        if (this.sessionHistoryManager) {
          this.sessionHistoryManager.appendOutput(sessionId, filteredData, 'output').catch(error => {
            logger.error(`Failed to store output in database: ${error.message}`);
          });
        }
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode }) => {
        if (outputTimer) clearTimeout(outputTimer);
        
        if (exitCode !== 0) {
          logger.error(`Session ${sessionId} exited with code ${exitCode}. Initial output: ${initialOutput.slice(0, 500)}`);
        } else {
          logger.info(`Session ${sessionId} exited with code ${exitCode}`);
        }
        
        onExit(exitCode);
        this.destroySession(sessionId, exitCode).catch(error => {
          logger.error(`Error destroying session: ${error.message}`);
        });
        this.emit('sessionExit', { sessionId, exitCode });
      });
      
      // Log initial output after a short delay for debugging
      outputTimer = setTimeout(() => {
        if (initialOutput) {
          logger.debug(`Session ${sessionId} initial output: ${initialOutput.slice(0, 200)}`);
        }
      }, 1000);

      // Store session
      this.sessions.set(sessionId, session);
      this.userSessionCounts.set(userId, userSessionCount + 1);

      // Record session in database
      if (this.sessionHistoryManager) {
        try {
          await this.sessionHistoryManager.createSession(sessionId, userId, workingDir, command);
        } catch (error: any) {
          logger.error(`Failed to record session in database: ${error.message}`);
        }
      }

      logger.info(`Created session ${sessionId} for user ${userId}`);
      this.emit('sessionCreated', { sessionId, userId, workingDir });

      return sessionId;
    } catch (error: any) {
      logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

  async writeToSession(sessionId: string, data: string): Promise<void> {
    let session = this.sessions.get(sessionId);
    
    // If session exists in tmux but not in memory, try to reattach
    if (!session && this.useTmux && await this.tmuxSessionExists(sessionId)) {
      logger.info(`Session ${sessionId} exists in tmux, attempting to reattach`);
      
      // Get session info from database
      if (this.sessionHistoryManager) {
        const dbSession = await this.sessionHistoryManager.getSession(sessionId);
        if (dbSession && dbSession.status === 'active') {
          // Reattach to tmux session with -d flag to detach other clients
          const tmuxName = `${this.tmuxPrefix}${sessionId}`;
          const ptyProcess = pty.spawn('tmux', ['attach-session', '-d', '-t', tmuxName], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              // Disable automatic terminal queries to prevent loops
              DISABLE_AUTO_TITLE: 'true'
            } as { [key: string]: string }
          });
          
          // Add a small delay to let tmux settle after attaching
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Create session object
          session = {
            id: sessionId,
            userId: dbSession.user_id,
            pty: ptyProcess,
            workingDir: dbSession.working_dir,
            command: dbSession.command,
            buffer: [],
            bufferSize: 0,
            createdAt: new Date(dbSession.created_at),
            lastActivity: new Date(),
            pid: ptyProcess.pid
          };
          
          // Set up handlers
          if (session) {
            this.setupSessionHandlers(session);
            this.sessions.set(sessionId, session);
          }
          
          logger.info(`Successfully reattached to tmux session ${sessionId}`);
        }
      }
    }
    
    if (!session) {
      logger.error(`writeToSession: Session ${sessionId} not found`);
      throw new Error(`Session ${sessionId} not found`);
    }

    // If session exists but has no PTY (restored from tmux), try to reattach
    if (!session.pty && this.useTmux) {
      logger.info(`Session ${sessionId} has no PTY, attempting to reattach to tmux`);
      const pty = await this.reattachTmuxSession(sessionId);
      if (!pty) {
        logger.error(`writeToSession: Failed to reattach to tmux session ${sessionId}`);
        throw new Error(`Session ${sessionId} has no active PTY process`);
      }
    }

    if (!session.pty) {
      logger.error(`writeToSession: Session ${sessionId} has no PTY process`);
      throw new Error(`Session ${sessionId} has no active PTY process`);
    }

    session.lastActivity = new Date();
    session.pty.write(data);
    logger.debug(`Wrote ${data.length} bytes to session ${sessionId}`);
    
    // Store input in database
    if (this.sessionHistoryManager) {
      this.sessionHistoryManager.appendOutput(sessionId, data, 'input').catch(error => {
        logger.error(`Failed to store input in database: ${error.message}`);
      });
    }
    
    // For tmux sessions, also try to capture any immediate output
    if (this.useTmux) {
      setTimeout(async () => {
        try {
          const recentOutput = await this.getTmuxBuffer(sessionId, 50);
          if (recentOutput) {
            // Get last few lines
            const lines = recentOutput.split('\n');
            const lastLines = lines.slice(-10).join('\n');
            if (lastLines.trim()) {
              logger.debug(`Captured recent tmux output for session ${sessionId}: ${lastLines.length} bytes`);
            }
          }
        } catch (err) {
          logger.debug(`Could not capture tmux buffer: ${err}`);
        }
      }, 100);
    }
  }

  async resizeSession(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // If session exists but has no PTY (restored from tmux), try to reattach
    if (!session.pty && this.useTmux) {
      logger.info(`Session ${sessionId} has no PTY for resize, attempting to reattach to tmux`);
      const pty = await this.reattachTmuxSession(sessionId);
      if (!pty) {
        logger.warn(`resizeSession: Failed to reattach to tmux session ${sessionId}, cannot resize`);
        return;
      }
    }

    if (!session.pty) {
      logger.warn(`resizeSession: Session ${sessionId} has no PTY process, cannot resize`);
      return;
    }

    session.pty.resize(cols, rows);
    logger.debug(`Resized session ${sessionId} to ${cols}x${rows}`);
  }

  async destroySession(sessionId: string, exitCode?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.pty.kill();
    } catch (error: any) {
      logger.error(`Error killing PTY process: ${error.message}`);
    }
    
    // Kill tmux session if using tmux
    if (this.useTmux) {
      await this.killTmuxSession(sessionId);
    }

    this.sessions.delete(sessionId);
    
    // Update user session count
    const userCount = this.userSessionCounts.get(session.userId) || 0;
    if (userCount > 0) {
      this.userSessionCounts.set(session.userId, userCount - 1);
    }
    
    // Close session in database
    if (this.sessionHistoryManager) {
      this.sessionHistoryManager.closeSession(sessionId, exitCode).catch(error => {
        logger.error(`Failed to close session in database: ${error.message}`);
      });
    }

    this.emit('sessionDestroyed', { sessionId });
  }

  async destroyAllSessions(): Promise<void> {
    const promises = [];
    for (const sessionId of this.sessions.keys()) {
      promises.push(this.destroySession(sessionId));
    }
    await Promise.all(promises);
  }

  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  isUsingTmux(): boolean {
    return this.useTmux;
  }
  
  async ensureSessionAttached(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && !session.pty && this.useTmux) {
      await this.reattachTmuxSession(sessionId);
    }
  }

  getSessionInfo(sessionId: string): SessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      id: session.id,
      userId: session.userId,
      workingDir: session.workingDir,
      command: session.command,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      pid: session.pty ? session.pty.pid : session.pid
    };
  }

  getUserSessions(userId: string): SessionInfo[] {
    const userSessions: SessionInfo[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        userSessions.push({
          id: session.id,
          userId: session.userId,
          workingDir: session.workingDir,
          command: session.command,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          pid: session.pty ? session.pty.pid : session.pid
        });
      }
    }

    return userSessions;
  }

  async getSessionBuffer(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    
    // If using tmux, get buffer from tmux even if session not in memory
    if (this.useTmux && await this.tmuxSessionExists(sessionId)) {
      const tmuxBuffer = await this.getTmuxBuffer(sessionId);
      if (tmuxBuffer) {
        return tmuxBuffer;
      }
    }
    
    // Fall back to in-memory buffer
    if (!session) return '';
    return session.buffer.join('');
  }

  private appendToBuffer(session: PTYSession, data: string): void {
    session.buffer.push(data);
    session.bufferSize += data.length;

    // Trim buffer if it exceeds max size
    if (session.bufferSize > this.MAX_BUFFER_SIZE) {
      let newSize = session.bufferSize;
      while (newSize > this.BUFFER_TRIM_SIZE && session.buffer.length > 0) {
        const removed = session.buffer.shift();
        if (removed) {
          newSize -= removed.length;
        }
      }
      session.bufferSize = newSize;
      logger.debug(`Trimmed buffer for session ${session.id} to ${newSize} bytes`);
    }
  }

  private generateSessionId(): string {
    return `sess_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  private setupSessionHandlers(session: PTYSession): void {
    const { id: sessionId, pty: ptyProcess } = session;
    
    // Handle PTY output
    ptyProcess.onData((data: string) => {
      // Filter problematic sequences if detected
      let filteredData = data;
      if (containsProblematicSequences(data)) {
        logger.debug(`Filtering problematic escape sequences from session ${sessionId}`);
        filteredData = filterTerminalOutput(data);
      }
      
      session.lastActivity = new Date();
      this.appendToBuffer(session, filteredData);
      logger.debug(`Emitting sessionData event for session ${sessionId}, data length: ${filteredData.length}`);
      this.emit('sessionData', { sessionId, data: filteredData });
      
      // Store output in database
      if (this.sessionHistoryManager) {
        this.sessionHistoryManager.appendOutput(sessionId, filteredData, 'output').catch(error => {
          logger.error(`Failed to store output in database: ${error.message}`);
        });
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(async ({ exitCode }) => {
      logger.info(`Session ${sessionId} exited with code ${exitCode}`);
      await this.destroySession(sessionId, exitCode);
      this.emit('sessionExit', { sessionId, exitCode });
    });
  }

  private async getUserApiKey(userId: string): Promise<string> {
    // Claude uses OAuth, not API keys
    // Return empty string to maintain compatibility
    return '';
  }

  // Session monitoring for health checks
  getActiveSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    
    for (const session of this.sessions.values()) {
      sessions.push({
        id: session.id,
        userId: session.userId,
        workingDir: session.workingDir,
        command: session.command,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        pid: session.pty ? session.pty.pid : session.pid
      });
    }

    return sessions;
  }

  // Check if session exists and is alive
  sessionExists(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session !== undefined;
  }

  // Backward compatibility alias
  closeSession(sessionId: string): void {
    this.destroySession(sessionId);
  }
}