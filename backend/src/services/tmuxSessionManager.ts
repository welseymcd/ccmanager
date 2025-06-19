import { spawn, IPty } from 'node-pty';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Session Manager using tmux for persistence
 * Much simpler than microservices!
 */
export class TmuxSessionManager extends EventEmitter {
  private tmuxPrefix = 'ccmanager_';
  private attachedSessions: Map<string, IPty> = new Map();
  
  /**
   * Create a new tmux session
   */
  async createSession(
    sessionId: string,
    workingDir: string,
    command: string,
    cols: number,
    rows: number
  ): Promise<IPty> {
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    
    try {
      // Create detached tmux session
      // For dev server commands, wrap in bash and keep session alive after command exits
      let sessionCommand = command;
      if (command.includes('npm') || command.includes('yarn') || command.includes('pnpm') || 
          command.includes('dev') || command.includes('start') || command.includes('.sh')) {
        // Keep the session alive after the dev server exits
        sessionCommand = `bash -c "${command}; echo ''; echo '=========================================='; echo 'Process exited. Press Enter to close or run commands...'; exec bash"`;
      }
      
      await execAsync(
        `tmux new-session -d -s ${tmuxSessionName} -c "${workingDir}" -x ${cols} -y ${rows} "${sessionCommand}"`
      );
      
      // Attach to it via node-pty
      return this.attachToSession(sessionId, cols, rows);
    } catch (error: any) {
      logger.error(`Failed to create tmux session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Attach to existing tmux session
   */
  async attachToSession(
    sessionId: string,
    cols: number,
    rows: number
  ): Promise<IPty> {
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    
    // Check if already attached
    const existing = this.attachedSessions.get(sessionId);
    if (existing) {
      return existing;
    }
    
    // Create PTY that attaches to tmux session with -d flag to detach other clients
    const pty = spawn('tmux', ['attach-session', '-d', '-t', tmuxSessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      env: process.env
    });
    
    this.attachedSessions.set(sessionId, pty);
    
    // Clean up on exit
    pty.onExit(() => {
      this.attachedSessions.delete(sessionId);
    });
    
    return pty;
  }
  
  /**
   * List all tmux sessions
   */
  async listSessions(): Promise<Array<{
    id: string;
    name: string;
    created: string;
    attached: boolean;
  }>> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}"');
      
      return stdout
        .trim()
        .split('\n')
        .filter(line => line.startsWith(this.tmuxPrefix))
        .map(line => {
          const [name, created, attached] = line.split(':');
          return {
            id: name.replace(this.tmuxPrefix, ''),
            name,
            created,
            attached: attached === '1'
          };
        });
    } catch (error: any) {
      if (error.message.includes('no server running')) {
        return [];
      }
      throw error;
    }
  }
  
  /**
   * Check if session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const sessions = await this.listSessions();
    return sessions.some(s => s.id === sessionId);
  }
  
  /**
   * Kill tmux session
   */
  async killSession(sessionId: string): Promise<void> {
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    
    try {
      await execAsync(`tmux kill-session -t ${tmuxSessionName}`);
      this.attachedSessions.delete(sessionId);
    } catch (error) {
      // Session might already be dead
    }
  }
  
  /**
   * Send keys to tmux session (useful for when not attached)
   */
  async sendKeys(sessionId: string, data: string): Promise<void> {
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    
    // Escape special characters
    const escaped = data
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$');
    
    await execAsync(`tmux send-keys -t ${tmuxSessionName} "${escaped}"`);
  }
  
  /**
   * Get session output (last N lines)
   */
  async getSessionBuffer(sessionId: string, lines: number = 1000): Promise<string> {
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    
    try {
      // Capture pane contents
      const { stdout } = await execAsync(
        `tmux capture-pane -t ${tmuxSessionName} -p -S -${lines}`
      );
      
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
      
      return filteredLines.join('\n');
    } catch (error: any) {
      logger.error(`Failed to get session buffer: ${error.message}`);
      return '';
    }
  }
  
  /**
   * Resize tmux session
   */
  async resizeSession(sessionId: string, cols: number, rows: number): Promise<void> {
    const pty = this.attachedSessions.get(sessionId);
    if (pty) {
      pty.resize(cols, rows);
    }
    
    // Also resize tmux window
    const tmuxSessionName = `${this.tmuxPrefix}${sessionId}`;
    try {
      await execAsync(`tmux resize-window -t ${tmuxSessionName} -x ${cols} -y ${rows}`);
    } catch (error) {
      // Ignore resize errors
    }
  }
}