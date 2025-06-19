import { SessionManager } from './sessionManager';
import { DatabaseManager } from '../database/manager';
import { randomBytes } from 'crypto';

export interface SessionOutput {
  lineNumber: number;
  content: string;
  type: 'input' | 'output' | 'system';
  timestamp: string;
}

export interface DevServerInfo {
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  port?: number;
  errorMessage?: string;
  sessionId?: string;
}

export class ProjectSessionService {
  private db: DatabaseManager;
  private sessionManager: SessionManager;
  private sessionStatusMap: Map<string, string>;
  private lineCounters: Map<string, number>;

  constructor(db: DatabaseManager, sessionManager: SessionManager) {
    this.db = db;
    this.sessionManager = sessionManager;
    this.sessionStatusMap = new Map();
    this.lineCounters = new Map();
  }

  /**
   * Create a new session for a project
   */
  async createProjectSession(
    projectId: string,
    userId: string,
    sessionType: 'main' | 'devserver'
  ): Promise<any> {
    // Get project info for working directory
    const project = this.db.get('SELECT * FROM projects WHERE id = ?', projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Create the base session with proper config
    const sessionId = await this.sessionManager.createSession({
      userId,
      workingDir: project.working_dir,
      command: sessionType === 'devserver' && project.dev_server_command 
        ? project.dev_server_command 
        : (project.main_command && project.main_command !== 'ccmanager') ? project.main_command : 'claude',
      onData: (data: string) => {
        // Save output to database
        this.saveSessionOutput(sessionId, data, 'output').catch(err => {
          console.error('Failed to save output:', err);
        });
      },
      onExit: (exitCode: number) => {
        // Update session status
        this.sessionStatusMap.set(sessionId, 'disconnected');
      }
    });
    
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Failed to create session');
    }

    this.sessionStatusMap.set(sessionId, 'connecting');
    this.lineCounters.set(sessionId, 0);

    // Link session to project
    this.db.run(`
      INSERT INTO project_sessions (project_id, session_id, session_type)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, session_type) DO UPDATE SET
        session_id = excluded.session_id,
        created_at = CURRENT_TIMESTAMP
    `, [projectId, sessionId, sessionType]);

    // Update session with project context
    this.db.run('UPDATE sessions SET project_id = ? WHERE id = ?', [projectId, sessionId]);

    // Mark as connected after a short delay (simulating connection)
    setTimeout(() => {
      this.updateSessionStatus(sessionId, 'connected');
    }, 100);

    return {
      id: sessionId,
      status: 'active'
    };
  }

  /**
   * Format terminal output for mobile-friendly display
   */
  formatTerminalOutput(rawOutput: string): string {
    // Strip ANSI escape codes (including incomplete sequences at the end)
    let formatted = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    // Remove incomplete escape sequences at the end
    formatted = formatted.replace(/\x1b\[[0-9;]*$/g, '');
    
    // Remove other control characters but preserve newlines
    formatted = formatted.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalize line endings
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Convert box drawing characters to simple ASCII
    const boxDrawingMap: { [key: string]: string } = {
      '╭': '+', '╮': '+', '╰': '+', '╯': '+',
      '┌': '+', '┐': '+', '└': '+', '┘': '+',
      '─': '-', '│': '|', '├': '+', '┤': '+',
      '┬': '+', '┴': '+', '┼': '+',
      '═': '=', '║': '|', '╔': '+', '╗': '+',
      '╚': '+', '╝': '+', '╠': '+', '╣': '+',
      '╦': '+', '╩': '+', '╬': '+'
    };
    
    for (const [char, replacement] of Object.entries(boxDrawingMap)) {
      formatted = formatted.replace(new RegExp(char, 'g'), replacement);
    }
    
    // Wrap long lines for mobile (120 chars)
    const lines = formatted.split('\n');
    const wrappedLines = lines.map(line => {
      if (line.length <= 120) return line;
      
      // Don't wrap code blocks
      if (line.startsWith('```') || line.match(/^\s{4,}/)) return line;
      
      const wrapped = [];
      for (let i = 0; i < line.length; i += 120) {
        wrapped.push(line.substring(i, i + 120));
      }
      return wrapped.join('\n');
    });
    
    return wrappedLines.join('\n');
  }

  /**
   * Get session connection status
   */
  getSessionStatus(sessionId: string): string {
    return this.sessionStatusMap.get(sessionId) || 'disconnected';
  }

  /**
   * Update session connection status
   */
  updateSessionStatus(sessionId: string, status: string): void {
    this.sessionStatusMap.set(sessionId, status);
  }

  /**
   * Format dev server output for display
   */
  formatDevServerOutput(outputs: Array<{ content: string; type: string }>): string {
    const formatted = outputs.map(output => {
      let content = output.content;
      
      // Add error prefix for stderr
      if (output.type === 'stderr') {
        content = `[ERROR] ${content}`;
      }
      
      return content;
    });
    
    // Remove excessive blank lines
    return formatted
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Highlight URLs in text
   */
  highlightUrls(text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  /**
   * Get dev server status
   */
  async getDevServerStatus(projectId: string): Promise<string> {
    const row = this.db.get('SELECT status FROM dev_servers WHERE project_id = ?', projectId);
    return row?.status || 'stopped';
  }

  /**
   * Update dev server status
   */
  async updateDevServerStatus(
    projectId: string,
    status: string,
    port?: number,
    errorMessage?: string
  ): Promise<void> {
    this.db.run(`
      INSERT INTO dev_servers (project_id, status, port, error_message, started_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id) DO UPDATE SET
        status = excluded.status,
        port = CASE WHEN excluded.port IS NOT NULL THEN excluded.port ELSE port END,
        error_message = excluded.error_message,
        started_at = CASE WHEN excluded.status = 'starting' THEN CURRENT_TIMESTAMP ELSE started_at END,
        stopped_at = CASE WHEN excluded.status = 'stopped' THEN CURRENT_TIMESTAMP ELSE stopped_at END
    `, [projectId, status, port || null, errorMessage || null]);
  }

  /**
   * Get dev server info
   */
  async getDevServerInfo(projectId: string): Promise<DevServerInfo> {
    const row = this.db.get(`
      SELECT status, port, error_message, session_id
      FROM dev_servers
      WHERE project_id = ?
    `, projectId);
    
    if (!row) {
      return { status: 'stopped' };
    }
    
    return {
      status: row.status,
      port: row.port,
      errorMessage: row.error_message,
      sessionId: row.session_id
    };
  }

  /**
   * Get session history
   */
  async getSessionHistory(sessionId: string, fromLine: number = 0): Promise<SessionOutput[]> {
    const rows = this.db.all(`
      SELECT line_number, content, type, timestamp
      FROM terminal_lines
      WHERE session_id = ? AND line_number > ?
      ORDER BY line_number ASC
      LIMIT 1000
    `, [sessionId, fromLine]);
    
    return rows.map((row: any) => ({
      lineNumber: row.line_number,
      content: row.content,
      type: row.type,
      timestamp: row.timestamp
    }));
  }

  /**
   * Save session output to database
   */
  async saveSessionOutput(
    sessionId: string,
    content: string,
    type: 'input' | 'output' | 'system'
  ): Promise<void> {
    const lineNumber = (this.lineCounters.get(sessionId) || 0) + 1;
    this.lineCounters.set(sessionId, lineNumber);
    
    this.db.run(`
      INSERT INTO terminal_lines (session_id, line_number, content, type)
      VALUES (?, ?, ?, ?)
    `, [sessionId, lineNumber, content, type]);
  }

  /**
   * Send command to Claude session
   */
  async sendCommand(sessionId: string, command: string): Promise<void> {
    // Save the input
    await this.saveSessionOutput(sessionId, command, 'input');
    
    // Send to PTY using SessionManager's writeToSession method
    this.sessionManager.writeToSession(sessionId, command + '\n');
  }

  /**
   * Get project sessions
   */
  async getProjectSessions(projectId: string): Promise<any[]> {
    const sessions = this.db.all(`
      SELECT 
        ps.*,
        s.status as session_status,
        s.created_at as session_created_at
      FROM project_sessions ps
      JOIN sessions s ON ps.session_id = s.id
      WHERE ps.project_id = ?
    `, projectId);
    
    // Validate sessions still exist in SessionManager
    return sessions.filter(session => {
      const exists = this.sessionManager.sessionExists(session.session_id);
      if (!exists && session.session_status === 'active') {
        // Clean up stale session from database
        this.db.run('UPDATE sessions SET status = ? WHERE id = ?', ['disconnected', session.session_id]);
      }
      return exists;
    });
  }

  /**
   * Close project session
   */
  async closeProjectSession(projectId: string, sessionType: 'main' | 'devserver'): Promise<void> {
    const row = this.db.get(`
      SELECT session_id FROM project_sessions
      WHERE project_id = ? AND session_type = ?
    `, [projectId, sessionType]);
    
    if (row?.session_id) {
      this.sessionManager.closeSession(row.session_id);
      this.sessionStatusMap.delete(row.session_id);
      this.lineCounters.delete(row.session_id);
    }
  }
}