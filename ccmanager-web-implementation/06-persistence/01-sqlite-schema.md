# Step 01: SQLite Database Schema and Session Persistence

## Objective
Implement SQLite database for session history persistence, user management, and API key storage with proper encryption.

## Test First: Database Schema Tests

```typescript
// backend/tests/database/schema.test.ts
import { Database } from 'better-sqlite3';
import { DatabaseManager } from '../../src/database/manager';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

describe('Database Schema', () => {
  let db: DatabaseManager;
  const testDbPath = './test-data/test.db';

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync('./test-data')) {
      fs.mkdirSync('./test-data');
    }
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    db.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('creates all required tables', () => {
    const tables = db.getTables();
    
    expect(tables).toContain('users');
    expect(tables).toContain('sessions');
    expect(tables).toContain('terminal_lines');
    expect(tables).toContain('api_keys');
    expect(tables).toContain('user_preferences');
  });

  test('users table has correct schema', () => {
    const schema = db.getTableSchema('users');
    
    expect(schema).toMatchObject({
      id: { type: 'TEXT', primaryKey: true },
      username: { type: 'TEXT', unique: true, notNull: true },
      password_hash: { type: 'TEXT', notNull: true },
      created_at: { type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      last_login: { type: 'DATETIME' },
      is_active: { type: 'INTEGER', default: 1 }
    });
  });

  test('sessions table has correct schema', () => {
    const schema = db.getTableSchema('sessions');
    
    expect(schema).toMatchObject({
      id: { type: 'TEXT', primaryKey: true },
      user_id: { type: 'TEXT', notNull: true, foreignKey: 'users.id' },
      working_dir: { type: 'TEXT' },
      command: { type: 'TEXT', default: 'claude' },
      created_at: { type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      last_activity: { type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      closed_at: { type: 'DATETIME' },
      status: { type: 'TEXT', default: 'active' },
      exit_code: { type: 'INTEGER' }
    });
  });

  test('terminal_lines table has correct indexes', () => {
    const indexes = db.getTableIndexes('terminal_lines');
    
    expect(indexes).toContain('idx_terminal_lines_session_timestamp');
    expect(indexes).toContain('idx_terminal_lines_session_line_number');
  });

  test('enforces foreign key constraints', () => {
    // Try to insert session with non-existent user
    expect(() => {
      db.run(`
        INSERT INTO sessions (id, user_id, working_dir) 
        VALUES ('sess_123', 'nonexistent_user', '/home/test')
      `);
    }).toThrow();
  });
});
```

## Test First: Session History Tests

```typescript
// backend/tests/database/sessionHistory.test.ts
import { SessionHistoryManager } from '../../src/database/sessionHistory';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

describe('SessionHistoryManager', () => {
  let historyManager: SessionHistoryManager;
  const testDbPath = './test-data/history-test.db';

  beforeEach(async () => {
    if (!fs.existsSync('./test-data')) {
      fs.mkdirSync('./test-data');
    }
    historyManager = new SessionHistoryManager(testDbPath);
    
    // Create test user
    await historyManager.createUser('testuser', 'hashedpassword');
  });

  afterEach(() => {
    historyManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('creates session record', async () => {
    const userId = await historyManager.getUserId('testuser');
    const sessionId = 'sess_test123';
    
    await historyManager.createSession(sessionId, userId!, '/home/test');
    
    const session = await historyManager.getSession(sessionId);
    expect(session).toMatchObject({
      id: sessionId,
      user_id: userId,
      working_dir: '/home/test',
      status: 'active'
    });
  });

  test('appends terminal output line by line', async () => {
    const sessionId = 'sess_test123';
    const userId = await historyManager.getUserId('testuser');
    await historyManager.createSession(sessionId, userId!, '/home/test');
    
    const output = 'Line 1\nLine 2\nLine 3';
    await historyManager.appendOutput(sessionId, output, 'output');
    
    const lines = await historyManager.getSessionHistory(sessionId);
    expect(lines).toHaveLength(3);
    expect(lines[0].content).toBe('Line 1');
    expect(lines[1].content).toBe('Line 2');
    expect(lines[2].content).toBe('Line 3');
  });

  test('retrieves recent history with limit', async () => {
    const sessionId = 'sess_test123';
    const userId = await historyManager.getUserId('testuser');
    await historyManager.createSession(sessionId, userId!, '/home/test');
    
    // Add 2000 lines
    for (let i = 1; i <= 2000; i++) {
      await historyManager.appendOutput(sessionId, `Line ${i}`, 'output');
    }
    
    const recentLines = await historyManager.getRecentHistory(sessionId, 1000);
    expect(recentLines).toHaveLength(1000);
    expect(recentLines[0].content).toBe('Line 1001');
    expect(recentLines[999].content).toBe('Line 2000');
  });

  test('marks session as closed', async () => {
    const sessionId = 'sess_test123';
    const userId = await historyManager.getUserId('testuser');
    await historyManager.createSession(sessionId, userId!, '/home/test');
    
    await historyManager.closeSession(sessionId, 0);
    
    const session = await historyManager.getSession(sessionId);
    expect(session?.status).toBe('closed');
    expect(session?.exit_code).toBe(0);
    expect(session?.closed_at).toBeDefined();
  });

  test('restores sessions for user', async () => {
    const userId = await historyManager.getUserId('testuser');
    
    // Create multiple sessions
    await historyManager.createSession('sess_1', userId!, '/home/test1');
    await historyManager.createSession('sess_2', userId!, '/home/test2');
    await historyManager.closeSession('sess_2', 0);
    await historyManager.createSession('sess_3', userId!, '/home/test3');
    
    const activeSessions = await historyManager.getUserActiveSessions(userId!);
    expect(activeSessions).toHaveLength(2);
    expect(activeSessions.map(s => s.id)).toContain('sess_1');
    expect(activeSessions.map(s => s.id)).toContain('sess_3');
  });
});
```

## Implementation

### 1. Database Schema

```sql
-- backend/src/database/schema.sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX idx_users_username ON users(username);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  working_dir TEXT,
  command TEXT DEFAULT 'claude',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed', 'crashed')),
  exit_code INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

-- Terminal output lines
CREATE TABLE IF NOT EXISTS terminal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'output' CHECK(type IN ('output', 'input', 'system')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_terminal_lines_session_timestamp ON terminal_lines(session_id, timestamp);
CREATE INDEX idx_terminal_lines_session_line_number ON terminal_lines(session_id, line_number);

-- API Keys (encrypted)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  encrypted_key TEXT NOT NULL,
  key_hint TEXT, -- Last 4 characters of key for identification
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'dark',
  terminal_font_size INTEGER DEFAULT 14,
  terminal_font_family TEXT DEFAULT 'monospace',
  default_working_dir TEXT,
  shortcuts TEXT, -- JSON string of custom shortcuts
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Session metadata (for restoration)
CREATE TABLE IF NOT EXISTS session_metadata (
  session_id TEXT PRIMARY KEY,
  tab_title TEXT,
  tab_position INTEGER,
  terminal_cols INTEGER DEFAULT 80,
  terminal_rows INTEGER DEFAULT 24,
  scroll_position INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### 2. Database Manager

```typescript
// backend/src/database/manager.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initializeSchema();
  }

  private initializeSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    try {
      this.db.exec(schema);
      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  getTables(): string[] {
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    return tables.map((t: any) => t.name);
  }

  getTableSchema(tableName: string): any {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const schema: any = {};
    
    columns.forEach((col: any) => {
      schema[col.name] = {
        type: col.type,
        notNull: col.notnull === 1,
        default: col.dflt_value,
        primaryKey: col.pk === 1
      };
    });
    
    return schema;
  }

  getTableIndexes(tableName: string): string[] {
    const indexes = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND tbl_name=?
    `).all(tableName);
    
    return indexes.map((idx: any) => idx.name);
  }

  run(sql: string, params?: any): Database.RunResult {
    return this.db.prepare(sql).run(params);
  }

  get(sql: string, params?: any): any {
    return this.db.prepare(sql).get(params);
  }

  all(sql: string, params?: any): any[] {
    return this.db.prepare(sql).all(params);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
```

### 3. Session History Manager

```typescript
// backend/src/database/sessionHistory.ts
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
        // Skip empty last line from split
        if (line.length > 0 || index < lines.length - 1) {
          this.run(`
            INSERT INTO terminal_lines (session_id, line_number, content, type)
            VALUES (?, ?, ?, ?)
          `, [sessionId, lastLineNumber + index + 1, line, type]);
        }
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
```

## Verification

Run tests to ensure database functionality:

```bash
cd backend && npm test -- tests/database/schema.test.ts
cd backend && npm test -- tests/database/sessionHistory.test.ts
```

## Migration Strategy

For production deployment:
1. Always backup existing database before schema changes
2. Use migration scripts for schema updates
3. Test migrations on copy of production data
4. Have rollback scripts ready

## Rollback Plan

If database initialization fails:
1. Check file permissions on data directory
2. Verify SQLite3 installation
3. Test with in-memory database first
4. Fall back to JSON file storage temporarily

## Next Step
Proceed to [02-api-key-encryption.md](./02-api-key-encryption.md) to implement secure API key storage.