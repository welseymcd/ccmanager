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