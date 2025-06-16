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
    
    expect(schema.id.type).toBe('TEXT');
    expect(schema.id.primaryKey).toBe(true);
    
    expect(schema.username.type).toBe('TEXT');
    expect(schema.username.notNull).toBe(true);
    expect(schema.username.unique).toBe(true);
    
    expect(schema.password_hash.type).toBe('TEXT');
    expect(schema.password_hash.notNull).toBe(true);
    
    expect(schema.created_at.type).toBe('DATETIME');
    expect(schema.created_at.default).toBe('CURRENT_TIMESTAMP');
    
    expect(schema.last_login.type).toBe('DATETIME');
    
    expect(schema.is_active.type).toBe('INTEGER');
    expect(schema.is_active.default).toBe('1');
  });

  test('sessions table has correct schema', () => {
    const schema = db.getTableSchema('sessions');
    
    expect(schema.id.type).toBe('TEXT');
    expect(schema.id.primaryKey).toBe(true);
    
    expect(schema.user_id.type).toBe('TEXT');
    expect(schema.user_id.notNull).toBe(true);
    expect(schema.user_id.foreignKey).toBe('users.id');
    
    expect(schema.working_dir.type).toBe('TEXT');
    
    expect(schema.command.type).toBe('TEXT');
    expect(schema.command.default).toBe("'claude'");
    
    expect(schema.created_at.type).toBe('DATETIME');
    expect(schema.created_at.default).toBe('CURRENT_TIMESTAMP');
    
    expect(schema.last_activity.type).toBe('DATETIME');
    expect(schema.last_activity.default).toBe('CURRENT_TIMESTAMP');
    
    expect(schema.closed_at.type).toBe('DATETIME');
    
    expect(schema.status.type).toBe('TEXT');
    expect(schema.status.default).toBe("'active'");
    
    expect(schema.exit_code.type).toBe('INTEGER');
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