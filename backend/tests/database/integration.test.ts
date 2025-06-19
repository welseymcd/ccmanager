import { SessionHistoryManager } from '../../src/database/sessionHistory';
import { generateId } from '../../src/utils/crypto';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

describe('Database Integration', () => {
  let db: SessionHistoryManager;
  const testDbPath = './test-data/integration-test.db';

  beforeEach(() => {
    if (!fs.existsSync('./test-data')) {
      fs.mkdirSync('./test-data');
    }
    db = new SessionHistoryManager(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('complete session lifecycle', async () => {
    // Create user
    const userId = await db.createUser('testuser', 'hashedpassword');
    expect(userId).toMatch(/^user_/);

    // Create session
    const sessionId = generateId('sess');
    await db.createSession(sessionId, userId, '/home/test', 'claude');

    // Append some output
    await db.appendOutput(sessionId, 'Welcome to Claude Code!\n', 'system');
    await db.appendOutput(sessionId, '$ ls\n', 'input');
    await db.appendOutput(sessionId, 'file1.txt\nfile2.txt\n', 'output');

    // Verify history
    const history = await db.getSessionHistory(sessionId);
    expect(history).toHaveLength(7); // Each string with \n creates multiple lines
    expect(history[0].content).toBe('Welcome to Claude Code!');
    expect(history[0].type).toBe('system');
    expect(history[1].content).toBe(''); // Empty line from the trailing \n
    expect(history[2].content).toBe('$ ls');
    expect(history[2].type).toBe('input');
    expect(history[4].content).toBe('file1.txt');
    expect(history[5].content).toBe('file2.txt');

    // Get recent history
    const recent = await db.getRecentHistory(sessionId, 2);
    expect(recent).toHaveLength(2);
    expect(recent[1].content).toBe(''); // The last empty line

    // Close session
    await db.closeSession(sessionId, 0);
    const session = await db.getSession(sessionId);
    expect(session?.status).toBe('closed');
    expect(session?.exit_code).toBe(0);

    // Verify no active sessions
    const activeSessions = await db.getUserActiveSessions(userId);
    expect(activeSessions).toHaveLength(0);
  });

  test('cleanup old sessions', async () => {
    const userId = await db.createUser('testuser', 'hashedpassword');

    // Create and close a session
    const sessionId = generateId('sess');
    await db.createSession(sessionId, userId, '/home/test');
    await db.closeSession(sessionId);

    // Manually update closed_at to be old
    db.run(`
      UPDATE sessions 
      SET closed_at = datetime('now', '-10 days')
      WHERE id = ?
    `, [sessionId]);

    // Run cleanup
    const cleaned = await db.cleanupOldSessions(7);
    expect(cleaned).toBe(1);

    // Verify session is gone
    const session = await db.getSession(sessionId);
    expect(session).toBeNull();
  });
});