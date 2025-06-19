import { SessionManager, SessionConfig } from '../../src/services/sessionManager';
import { ApiKeyManager } from '../../src/services/apiKeyManager';
import { EventEmitter } from 'events';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      onData: (cb: Function) => emitter.on('data', cb),
      onExit: (cb: Function) => emitter.on('exit', cb),
      pid: 12345,
      process: 'claude',
      // Test helper to emit data
      _emit: (event: string, data: any) => emitter.emit(event, data)
    };
  })
}));

// Mock ApiKeyManager
vi.mock('../../src/services/apiKeyManager', () => ({
  ApiKeyManager: vi.fn().mockImplementation(() => ({
    getApiKey: vi.fn().mockResolvedValue('sk-ant-test-key-12345')
  }))
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockApiKeyManager: ApiKeyManager;

  beforeEach(() => {
    mockApiKeyManager = new ApiKeyManager('test.db');
    sessionManager = new SessionManager(mockApiKeyManager);
  });

  afterEach(() => {
    sessionManager.destroyAllSessions();
  });

  test('creates session with unique ID', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    
    expect(sessionId).toMatch(/^sess_[a-z0-9]+$/);
    expect(sessionManager.getSession(sessionId)).toBeDefined();
  });

  test('enforces user session limit', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    // Create max sessions
    for (let i = 0; i < 20; i++) {
      await sessionManager.createSession(config);
    }

    // 21st session should fail
    await expect(sessionManager.createSession(config))
      .rejects.toThrow('Maximum session limit reached');
  });

  test('writes data to PTY process', async () => {
    const onData = vi.fn();
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData,
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    sessionManager.writeToSession(sessionId, 'test input');
    
    expect(session?.pty.write).toHaveBeenCalledWith('test input');
  });

  test('handles PTY data output', async () => {
    const onData = vi.fn();
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData,
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    // Simulate PTY output
    (session?.pty as any)._emit('data', 'Hello from Claude');
    
    expect(onData).toHaveBeenCalledWith('Hello from Claude');
  });

  test('buffers output data', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    // Simulate multiple outputs
    (session?.pty as any)._emit('data', 'Line 1\n');
    (session?.pty as any)._emit('data', 'Line 2\n');
    (session?.pty as any)._emit('data', 'Line 3\n');
    
    const buffer = sessionManager.getSessionBuffer(sessionId);
    expect(buffer).toBe('Line 1\nLine 2\nLine 3\n');
  });

  test('enforces buffer size limit', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    // Generate large output (> 10MB)
    const largeData = 'x'.repeat(11 * 1024 * 1024);
    (session?.pty as any)._emit('data', largeData);
    
    const buffer = sessionManager.getSessionBuffer(sessionId);
    expect(buffer.length).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  test('handles session termination', async () => {
    const onExit = vi.fn();
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    // Simulate process exit
    (session?.pty as any)._emit('exit', { exitCode: 0 });
    
    expect(onExit).toHaveBeenCalledWith(0);
    expect(sessionManager.getSession(sessionId)).toBeUndefined();
  });

  test('resizes terminal dimensions', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    
    sessionManager.resizeSession(sessionId, 120, 40);
    
    expect(session?.pty.resize).toHaveBeenCalledWith(120, 40);
  });

  test('lists user sessions', async () => {
    const config1: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test1',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const config2: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test2',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const config3: SessionConfig = {
      userId: 'user456',
      workingDir: '/home/test3',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    await sessionManager.createSession(config1);
    await sessionManager.createSession(config2);
    await sessionManager.createSession(config3);
    
    const userSessions = sessionManager.getUserSessions('user123');
    expect(userSessions.length).toBe(2);
    expect(userSessions.every(s => s.userId === 'user123')).toBe(true);
  });

  test('emits session events', async () => {
    const sessionCreatedHandler = vi.fn();
    const sessionDataHandler = vi.fn();
    const sessionExitHandler = vi.fn();
    const sessionDestroyedHandler = vi.fn();

    sessionManager.on('sessionCreated', sessionCreatedHandler);
    sessionManager.on('sessionData', sessionDataHandler);
    sessionManager.on('sessionExit', sessionExitHandler);
    sessionManager.on('sessionDestroyed', sessionDestroyedHandler);

    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    expect(sessionCreatedHandler).toHaveBeenCalledWith({
      sessionId,
      userId: 'user123',
      workingDir: '/home/test'
    });

    const session = sessionManager.getSession(sessionId);
    (session?.pty as any)._emit('data', 'test data');
    expect(sessionDataHandler).toHaveBeenCalledWith({
      sessionId,
      data: 'test data'
    });

    (session?.pty as any)._emit('exit', { exitCode: 0 });
    expect(sessionExitHandler).toHaveBeenCalledWith({
      sessionId,
      exitCode: 0
    });
    expect(sessionDestroyedHandler).toHaveBeenCalledWith({
      sessionId
    });
  });

  test('getSessionInfo returns session metadata', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const sessionInfo = sessionManager.getSessionInfo(sessionId);

    expect(sessionInfo).toBeDefined();
    expect(sessionInfo?.id).toBe(sessionId);
    expect(sessionInfo?.userId).toBe('user123');
    expect(sessionInfo?.workingDir).toBe('/home/test');
    expect(sessionInfo?.command).toBe('claude');
    expect(sessionInfo?.pid).toBe(12345);
    expect(sessionInfo?.createdAt).toBeInstanceOf(Date);
    expect(sessionInfo?.lastActivity).toBeInstanceOf(Date);
  });

  test('getActiveSessions returns all sessions', async () => {
    const config1: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test1',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const config2: SessionConfig = {
      userId: 'user456',
      workingDir: '/home/test2',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    await sessionManager.createSession(config1);
    await sessionManager.createSession(config2);

    const activeSessions = sessionManager.getActiveSessions();
    expect(activeSessions.length).toBe(2);
    expect(activeSessions[0].userId).toBeDefined();
    expect(activeSessions[1].userId).toBeDefined();
  });

  test('sessionExists checks session presence', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    
    expect(sessionManager.sessionExists(sessionId)).toBe(true);
    expect(sessionManager.sessionExists('invalid-session-id')).toBe(false);
  });

  test('closeSession is backward compatible alias for destroySession', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    sessionManager.closeSession(sessionId);
    
    expect(sessionManager.getSession(sessionId)).toBeUndefined();
  });

  test('handles API key retrieval failure', async () => {
    const mockApiKeyManagerFailing = new ApiKeyManager('test.db');
    (mockApiKeyManagerFailing.getApiKey as any).mockResolvedValue(null);
    
    const sessionManagerFailing = new SessionManager(mockApiKeyManagerFailing);
    
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    await expect(sessionManagerFailing.createSession(config))
      .rejects.toThrow('No API key configured for user');
  });

  test('updates lastActivity on write', async () => {
    const config: SessionConfig = {
      userId: 'user123',
      workingDir: '/home/test',
      command: 'claude',
      onData: vi.fn(),
      onExit: vi.fn()
    };

    const sessionId = await sessionManager.createSession(config);
    const session = sessionManager.getSession(sessionId);
    const initialActivity = session?.lastActivity;

    // Wait a bit to ensure time difference
    await new Promise(resolve => setTimeout(resolve, 10));

    sessionManager.writeToSession(sessionId, 'test');
    const updatedSession = sessionManager.getSession(sessionId);
    
    expect(updatedSession?.lastActivity.getTime()).toBeGreaterThan(initialActivity!.getTime());
  });
});