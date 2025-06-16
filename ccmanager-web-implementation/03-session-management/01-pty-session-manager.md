# Step 01: PTY Session Manager Implementation

## Objective
Create a robust PTY session manager that handles Claude Code processes with proper lifecycle management, output buffering, and error handling.

## Test First: Session Manager Tests

```typescript
// backend/tests/services/sessionManager.test.ts
import { SessionManager, SessionConfig } from '../../src/services/sessionManager';
import { EventEmitter } from 'events';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      write: vi.fn(),
      kill: vi.fn(),
      onData: (cb: Function) => emitter.on('data', cb),
      onExit: (cb: Function) => emitter.on('exit', cb),
      pid: 12345,
      process: 'claude',
      // Test helper to emit data
      _emit: (event: string, data: any) => emitter.emit(event, data)
    };
  })
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
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
    session?.pty._emit('data', 'Hello from Claude');
    
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
    session?.pty._emit('data', 'Line 1\n');
    session?.pty._emit('data', 'Line 2\n');
    session?.pty._emit('data', 'Line 3\n');
    
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
    session?.pty._emit('data', largeData);
    
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
    session?.pty._emit('exit', 0);
    
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
});
```

## Implementation

```typescript
// backend/src/services/sessionManager.ts
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface SessionConfig {
  userId: string;
  workingDir?: string;
  command?: string;
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

  constructor() {
    super();
  }

  async createSession(config: SessionConfig): Promise<string> {
    const { userId, workingDir = process.cwd(), command = 'claude', onData, onExit } = config;

    // Check user session limit
    const userSessionCount = this.userSessionCounts.get(userId) || 0;
    if (userSessionCount >= this.MAX_SESSIONS_PER_USER) {
      throw new Error('Maximum session limit reached');
    }

    const sessionId = this.generateSessionId();
    
    try {
      // Get user's API key from secure storage
      const apiKey = await this.getUserApiKey(userId);
      
      // Spawn PTY process
      const ptyProcess = pty.spawn(command, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey,
          CCMANAGER_SESSION_ID: sessionId
        }
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

      // Handle PTY output
      ptyProcess.onData((data: string) => {
        session.lastActivity = new Date();
        this.appendToBuffer(session, data);
        onData(data);
        this.emit('sessionData', { sessionId, data });
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode }) => {
        logger.info(`Session ${sessionId} exited with code ${exitCode}`);
        onExit(exitCode);
        this.destroySession(sessionId);
        this.emit('sessionExit', { sessionId, exitCode });
      });

      // Store session
      this.sessions.set(sessionId, session);
      this.userSessionCounts.set(userId, userSessionCount + 1);

      logger.info(`Created session ${sessionId} for user ${userId}`);
      this.emit('sessionCreated', { sessionId, userId, workingDir });

      return sessionId;
    } catch (error) {
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
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.pty.resize(cols, rows);
    logger.debug(`Resized session ${sessionId} to ${cols}x${rows}`);
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.pty.kill();
    } catch (error) {
      logger.error(`Error killing PTY process: ${error.message}`);
    }

    this.sessions.delete(sessionId);
    
    // Update user session count
    const userCount = this.userSessionCounts.get(session.userId) || 0;
    if (userCount > 0) {
      this.userSessionCounts.set(session.userId, userCount - 1);
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
    // TODO: Implement secure API key retrieval from database
    // This is a placeholder - implement proper key management
    return process.env.ANTHROPIC_API_KEY || '';
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
}

// Export singleton instance
export const sessionManager = new SessionManager();
```

## Verification

Run tests to ensure session manager works correctly:

```bash
cd backend && npm test -- tests/services/sessionManager.test.ts
```

## Monitoring & Logging

The session manager emits the following events for monitoring:
- `sessionCreated`: New session started
- `sessionDestroyed`: Session terminated
- `sessionData`: Data received from PTY
- `sessionExit`: PTY process exited

## Rollback Plan

If session management fails:
1. Check PTY process permissions
2. Verify Claude command availability
3. Monitor system resources (file descriptors)
4. Implement graceful degradation with mock sessions for testing

## Next Step
Proceed to [02-session-persistence.md](./02-session-persistence.md) to implement session history persistence.