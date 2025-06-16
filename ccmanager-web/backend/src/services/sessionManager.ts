import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import { ApiKeyManager } from './apiKeyManager';
import { SessionHistoryManager } from '../database/sessionHistory';

export interface SessionConfig {
  userId: string;
  workingDir?: string;
  command?: string;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
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

  constructor(apiKeyManager: ApiKeyManager, sessionHistoryManager?: SessionHistoryManager) {
    super();
    this.apiKeyManager = apiKeyManager;
    this.sessionHistoryManager = sessionHistoryManager;
  }

  async createSession(config: SessionConfig): Promise<string> {
    const { userId, workingDir = process.cwd(), command = process.env.CLAUDE_COMMAND || 'claude', cols = 80, rows = 24, onData, onExit } = config;

    // Check user session limit
    const userSessionCount = this.userSessionCounts.get(userId) || 0;
    if (userSessionCount >= this.MAX_SESSIONS_PER_USER) {
      throw new Error('Maximum session limit reached');
    }

    const sessionId = this.generateSessionId();
    
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
      
      const ptyProcess = pty.spawn(actualCommand, args, {
        name: 'xterm-256color',
        cols: cols,
        rows: rows,
        cwd: workingDir,
        env: {
          ...process.env,
          CCMANAGER_SESSION_ID: sessionId,
          // Remove ANTHROPIC_API_KEY - Claude uses OAuth instead
        } as { [key: string]: string }
      });

      const session: PTYSession = {
        id: sessionId,
        userId,
        pty: ptyProcess,
        workingDir,
        command,
        buffer: [],
        bufferSize: 0,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Collect initial output for error diagnosis
      let initialOutput = '';
      let outputTimer: NodeJS.Timeout;
      
      // Handle PTY output
      ptyProcess.onData((data: string) => {
        session.lastActivity = new Date();
        this.appendToBuffer(session, data);
        onData(data);
        this.emit('sessionData', { sessionId, data });
        
        // Collect initial output for debugging
        if (initialOutput.length < 1000) {
          initialOutput += data;
        }
        
        // Store output in database
        if (this.sessionHistoryManager) {
          this.sessionHistoryManager.appendOutput(sessionId, data, 'output').catch(error => {
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
        this.destroySession(sessionId, exitCode);
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

  writeToSession(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    session.pty.write(data);
    
    // Store input in database
    if (this.sessionHistoryManager) {
      this.sessionHistoryManager.appendOutput(sessionId, data, 'input').catch(error => {
        logger.error(`Failed to store input in database: ${error.message}`);
      });
    }
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.pty.resize(cols, rows);
    logger.debug(`Resized session ${sessionId} to ${cols}x${rows}`);
  }

  destroySession(sessionId: string, exitCode?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.pty.kill();
    } catch (error: any) {
      logger.error(`Error killing PTY process: ${error.message}`);
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

  destroyAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }
  }

  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId);
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
      pid: session.pty.pid
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
          pid: session.pty.pid
        });
      }
    }

    return userSessions;
  }

  getSessionBuffer(sessionId: string): string {
    const session = this.sessions.get(sessionId);
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
        pid: session.pty.pid
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