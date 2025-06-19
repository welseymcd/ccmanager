import { DatabaseManager } from './manager';
import { generateId } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface SessionRecord {
  id: string;
  user_id: string;
  working_dir: string;
  command: string;
  created_at: string;
  last_activity: string;
  closed_at?: string;
  status: 'active' | 'closed' | 'crashed';
  exit_code?: number;
}

export interface TerminalLine {
  id: number;
  session_id: string;
  timestamp: string;
  line_number: number;
  content: string;
  type: 'output' | 'input' | 'system';
}

export class SessionHistoryManager extends DatabaseManager {
  constructor(dbPath: string) {
    super(dbPath);
  }

  async createUser(username: string, passwordHash: string): Promise<string> {
    const userId = generateId('user');
    
    this.run(`
      INSERT INTO users (id, username, password_hash)
      VALUES (?, ?, ?)
    `, [userId, username, passwordHash]);
    
    // Create default preferences
    this.run(`
      INSERT INTO user_preferences (user_id)
      VALUES (?)
    `, [userId]);
    
    return userId;
  }

  async getUserId(username: string): Promise<string | null> {
    const user = this.get(`
      SELECT id FROM users WHERE username = ?
    `, [username]);
    
    return user?.id || null;
  }

  async createSession(sessionId: string, userId: string, workingDir: string, command: string = 'claude'): Promise<void> {
    this.run(`
      INSERT INTO sessions (id, user_id, working_dir, command)
      VALUES (?, ?, ?, ?)
    `, [sessionId, userId, workingDir, command]);
    
    logger.info(`Created session record: ${sessionId}`);
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const session = this.get(`
      SELECT * FROM sessions WHERE id = ?
    `, [sessionId]);
    
    return session || null;
  }

  async appendOutput(sessionId: string, content: string, type: 'output' | 'input' | 'system' = 'output'): Promise<void> {
    const lines = content.split('\n');
    const lastLineNumber = await this.getLastLineNumber(sessionId);
    
    this.transaction(() => {
      lines.forEach((line, index) => {
        // Always insert lines, even if empty (preserves formatting)
        this.run(`
          INSERT INTO terminal_lines (session_id, line_number, content, type)
          VALUES (?, ?, ?, ?)
        `, [sessionId, lastLineNumber + index + 1, line, type]);
      });
      
      // Update session last activity
      this.run(`
        UPDATE sessions 
        SET last_activity = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [sessionId]);
    });
  }

  async getLastLineNumber(sessionId: string): Promise<number> {
    const result = this.get(`
      SELECT MAX(line_number) as max_line 
      FROM terminal_lines 
      WHERE session_id = ?
    `, [sessionId]);
    
    return result?.max_line || 0;
  }

  async getSessionHistory(sessionId: string, fromLine?: number): Promise<TerminalLine[]> {
    const query = fromLine 
      ? `SELECT * FROM terminal_lines WHERE session_id = ? AND line_number >= ? ORDER BY line_number`
      : `SELECT * FROM terminal_lines WHERE session_id = ? ORDER BY line_number`;
    
    const params = fromLine ? [sessionId, fromLine] : [sessionId];
    return this.all(query, params);
  }

  async getRecentHistory(sessionId: string, lineCount: number = 1000): Promise<TerminalLine[]> {
    const lines = this.all(`
      SELECT * FROM terminal_lines 
      WHERE session_id = ? 
      ORDER BY line_number DESC 
      LIMIT ?
    `, [sessionId, lineCount]);
    
    return lines.reverse();
  }

  async closeSession(sessionId: string, exitCode?: number): Promise<void> {
    this.run(`
      UPDATE sessions 
      SET status = 'closed', 
          closed_at = CURRENT_TIMESTAMP,
          exit_code = ?
      WHERE id = ?
    `, [exitCode, sessionId]);
  }

  async getUserActiveSessions(userId: string): Promise<SessionRecord[]> {
    return this.all(`
      SELECT * FROM sessions 
      WHERE user_id = ? AND status = 'active'
      ORDER BY last_activity DESC
    `, [userId]);
  }

  async cleanupOldSessions(daysOld: number = 7): Promise<number> {
    const result = this.run(`
      DELETE FROM sessions 
      WHERE status = 'closed' 
      AND closed_at < datetime('now', '-' || ? || ' days')
    `, [daysOld]);
    
    logger.info(`Cleaned up ${result.changes} old sessions`);
    return result.changes;
  }
}