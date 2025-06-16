# Step 01: WebSocket Setup and Protocol Definition

## Objective
Establish WebSocket communication layer with proper message typing and error handling.

## Test First: WebSocket Connection Tests

```typescript
// backend/tests/websocket/connection.test.ts
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Client from 'socket.io-client';
import { setupWebSocketHandlers } from '../../src/websocket/handlers';

describe('WebSocket Connection', () => {
  let io: SocketIOServer;
  let serverSocket: any;
  let clientSocket: any;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);
    setupWebSocketHandlers(io);
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = Client(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });

  test('client connects successfully', () => {
    expect(serverSocket).toBeDefined();
    expect(clientSocket.connected).toBe(true);
  });

  test('client receives connection_status on connect', (done) => {
    clientSocket.on('connection_status', (data: any) => {
      expect(data).toEqual({
        type: 'connection_status',
        status: 'connected'
      });
      done();
    });
  });

  test('handles authentication message', (done) => {
    clientSocket.emit('authenticate', { token: 'valid-jwt-token' });
    clientSocket.on('authenticated', (data: any) => {
      expect(data.success).toBe(true);
      expect(data.userId).toBeDefined();
      done();
    });
  });

  test('rejects invalid authentication', (done) => {
    clientSocket.emit('authenticate', { token: 'invalid-token' });
    clientSocket.on('authentication_error', (data: any) => {
      expect(data.error).toBe('Invalid token');
      done();
    });
  });
});
```

## Test First: Message Protocol Tests

```typescript
// shared/types/websocket-messages.test.ts
import { validateMessage, WebSocketMessage } from '../websocket-messages';

describe('WebSocket Message Validation', () => {
  test('validates terminal_input message', () => {
    const message: WebSocketMessage = {
      type: 'terminal_input',
      sessionId: 'sess_123',
      data: 'ls -la'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('rejects message with missing required fields', () => {
    const message = {
      type: 'terminal_input',
      // missing sessionId and data
    };
    
    expect(validateMessage(message)).toBe(false);
  });

  test('validates create_session message', () => {
    const message: WebSocketMessage = {
      type: 'create_session',
      workingDir: '/home/user/project',
      command: 'claude'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('allows optional fields in create_session', () => {
    const message: WebSocketMessage = {
      type: 'create_session'
      // workingDir and command are optional
    };
    
    expect(validateMessage(message)).toBe(true);
  });
});
```

## Implementation

### 1. Define WebSocket Message Types

```typescript
// shared/types/websocket-messages.ts
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// Client -> Server Messages
export interface ClientMessage {
  id?: string; // Optional request ID for tracking
  timestamp?: number;
}

export interface TerminalInputMessage extends ClientMessage {
  type: 'terminal_input';
  sessionId: string;
  data: string;
}

export interface CreateSessionMessage extends ClientMessage {
  type: 'create_session';
  workingDir?: string;
  command?: string;
}

export interface CloseSessionMessage extends ClientMessage {
  type: 'close_session';
  sessionId: string;
}

export interface ResizeTerminalMessage extends ClientMessage {
  type: 'resize_terminal';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface AuthenticateMessage extends ClientMessage {
  type: 'authenticate';
  token: string;
}

export type ClientToServerMessage = 
  | TerminalInputMessage
  | CreateSessionMessage
  | CloseSessionMessage
  | ResizeTerminalMessage
  | AuthenticateMessage;

// Server -> Client Messages
export interface ServerMessage {
  timestamp: number;
  requestId?: string; // Echo back client's request ID
}

export interface TerminalOutputMessage extends ServerMessage {
  type: 'terminal_output';
  sessionId: string;
  data: string;
}

export interface SessionCreatedMessage extends ServerMessage {
  type: 'session_created';
  sessionId: string;
  workingDir: string;
}

export interface SessionClosedMessage extends ServerMessage {
  type: 'session_closed';
  sessionId: string;
  exitCode?: number;
}

export interface SessionErrorMessage extends ServerMessage {
  type: 'session_error';
  sessionId: string;
  error: string;
}

export interface ConnectionStatusMessage extends ServerMessage {
  type: 'connection_status';
  status: ConnectionStatus;
}

export interface AuthenticationResultMessage extends ServerMessage {
  type: 'authenticated' | 'authentication_error';
  success?: boolean;
  userId?: string;
  error?: string;
}

export type ServerToClientMessage = 
  | TerminalOutputMessage
  | SessionCreatedMessage
  | SessionClosedMessage
  | SessionErrorMessage
  | ConnectionStatusMessage
  | AuthenticationResultMessage;

export type WebSocketMessage = ClientToServerMessage | ServerToClientMessage;

// Message validation
export function validateMessage(message: any): message is WebSocketMessage {
  if (!message || typeof message !== 'object') return false;
  if (!message.type || typeof message.type !== 'string') return false;
  
  switch (message.type) {
    case 'terminal_input':
      return typeof message.sessionId === 'string' && 
             typeof message.data === 'string';
    
    case 'create_session':
      return !message.workingDir || typeof message.workingDir === 'string';
    
    case 'close_session':
      return typeof message.sessionId === 'string';
    
    case 'resize_terminal':
      return typeof message.sessionId === 'string' &&
             typeof message.cols === 'number' &&
             typeof message.rows === 'number';
    
    case 'authenticate':
      return typeof message.token === 'string';
    
    default:
      return false;
  }
}
```

### 2. WebSocket Server Setup

```typescript
// backend/src/websocket/handlers.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ClientToServerMessage, ServerToClientMessage } from '@shared/types/websocket-messages';
import { authenticateSocket } from '../middleware/socketAuth';
import { SessionManager } from '../services/sessionManager';
import { logger } from '../utils/logger';

interface SocketData {
  userId?: string;
  authenticated: boolean;
}

export function setupWebSocketHandlers(io: SocketIOServer) {
  const sessionManager = new SessionManager();

  io.use(authenticateSocket);

  io.on('connection', (socket: Socket) => {
    logger.info(`WebSocket connection established: ${socket.id}`);
    
    // Send initial connection status
    const connectionMessage: ServerToClientMessage = {
      type: 'connection_status',
      status: 'connected',
      timestamp: Date.now()
    };
    socket.emit('connection_status', connectionMessage);

    // Handle authentication
    socket.on('authenticate', async (message: ClientToServerMessage) => {
      if (message.type !== 'authenticate') return;
      
      try {
        const userId = await verifyToken(message.token);
        socket.data.userId = userId;
        socket.data.authenticated = true;
        
        const response: ServerToClientMessage = {
          type: 'authenticated',
          success: true,
          userId,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('authenticated', response);
      } catch (error) {
        const response: ServerToClientMessage = {
          type: 'authentication_error',
          error: 'Invalid token',
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('authentication_error', response);
      }
    });

    // Handle terminal input
    socket.on('terminal_input', (message: ClientToServerMessage) => {
      if (message.type !== 'terminal_input') return;
      if (!socket.data.authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      sessionManager.writeToSession(message.sessionId, message.data);
    });

    // Handle session creation
    socket.on('create_session', async (message: ClientToServerMessage) => {
      if (message.type !== 'create_session') return;
      if (!socket.data.authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        const sessionId = await sessionManager.createSession({
          userId: socket.data.userId!,
          workingDir: message.workingDir,
          command: message.command,
          onData: (data: string) => {
            const output: ServerToClientMessage = {
              type: 'terminal_output',
              sessionId,
              data,
              timestamp: Date.now()
            };
            socket.emit('terminal_output', output);
          },
          onExit: (exitCode: number) => {
            const closed: ServerToClientMessage = {
              type: 'session_closed',
              sessionId,
              exitCode,
              timestamp: Date.now()
            };
            socket.emit('session_closed', closed);
          }
        });
        
        const created: ServerToClientMessage = {
          type: 'session_created',
          sessionId,
          workingDir: message.workingDir || process.cwd(),
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_created', created);
      } catch (error) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: '',
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_error', errorMessage);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`WebSocket disconnected: ${socket.id}`);
      // Sessions remain active for reconnection
    });
  });
}
```

### 3. WebSocket Client Wrapper

```typescript
// frontend/src/services/websocket.ts
import { io, Socket } from 'socket.io-client';
import { 
  ClientToServerMessage, 
  ServerToClientMessage,
  ConnectionStatus 
} from '@shared/types/websocket-messages';

export class WebSocketClient {
  private socket: Socket | null = null;
  private messageHandlers = new Map<string, Set<Function>>();
  private requestCallbacks = new Map<string, Function>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  connect(url: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(url, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts
      });

      this.socket.on('connect', () => {
        this.reconnectAttempts = 0;
        this.emit('connection_status', { status: 'connected' });
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        reject(error);
      });

      this.socket.on('disconnect', () => {
        this.emit('connection_status', { status: 'disconnected' });
      });

      this.socket.io.on('reconnect_attempt', () => {
        this.reconnectAttempts++;
        this.emit('connection_status', { status: 'reconnecting' });
      });

      // Set up message handlers
      this.setupMessageHandlers();
    });
  }

  private setupMessageHandlers() {
    if (!this.socket) return;

    // Handle all server messages
    const messageTypes: Array<ServerToClientMessage['type']> = [
      'terminal_output',
      'session_created',
      'session_closed',
      'session_error',
      'connection_status',
      'authenticated',
      'authentication_error'
    ];

    messageTypes.forEach(type => {
      this.socket!.on(type, (message: ServerToClientMessage) => {
        // Handle request callbacks
        if (message.requestId && this.requestCallbacks.has(message.requestId)) {
          const callback = this.requestCallbacks.get(message.requestId)!;
          callback(message);
          this.requestCallbacks.delete(message.requestId);
        }

        // Handle general message handlers
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }
      });
    });
  }

  sendMessage(message: ClientToServerMessage): Promise<ServerToClientMessage> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      const requestId = this.generateRequestId();
      const messageWithId = { ...message, id: requestId };

      // Set up callback for response
      this.requestCallbacks.set(requestId, resolve);

      // Send message
      this.socket.emit(message.type, messageWithId);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.requestCallbacks.has(requestId)) {
          this.requestCallbacks.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  on(type: string, handler: Function) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  off(type: string, handler: Function) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(type: string, data: any) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
```

## Verification

Run tests to ensure WebSocket setup is working:

```bash
cd backend && npm test -- tests/websocket/connection.test.ts
cd ../shared && npm test -- types/websocket-messages.test.ts
```

## Rollback Plan

If WebSocket connection fails:
1. Check firewall/proxy settings
2. Verify Socket.IO version compatibility
3. Test with basic HTTP first
4. Use Socket.IO debugging: `localStorage.debug = 'socket.io-client:*'`

## Next Step
Proceed to [02-message-queuing.md](./02-message-queuing.md) to implement message queuing for reliability.