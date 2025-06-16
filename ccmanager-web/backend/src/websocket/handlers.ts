import { Server as SocketIOServer, Socket } from 'socket.io';
import { ClientToServerMessage, ServerToClientMessage } from '@shared/types/websocket-messages';
import { authenticateSocket, verifyToken } from '../middleware/socketAuth';
import { SessionManager } from '../services/sessionManager';
import { ApiKeyManager } from '../services/apiKeyManager';
import { SessionHistoryManager } from '../database/sessionHistory';
import { logger } from '../utils/logger';

interface SocketData {
  userId?: string;
  authenticated: boolean;
}

export function setupWebSocketHandlers(
  io: SocketIOServer, 
  apiKeyManager: ApiKeyManager,
  sessionHistoryManager: SessionHistoryManager,
  sessionManager?: SessionManager
) {
  // Use provided sessionManager or create a new one
  const manager = sessionManager || new SessionManager(apiKeyManager, sessionHistoryManager);

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
        (socket.data as SocketData).userId = userId;
        (socket.data as SocketData).authenticated = true;
        
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
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        manager.writeToSession(message.sessionId, message.data);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: message.sessionId,
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_error', errorMessage);
      }
    });

    // Handle session creation
    socket.on('create_session', async (message: ClientToServerMessage) => {
      logger.info(`Received create_session request from socket ${socket.id}`);
      if (message.type !== 'create_session') return;
      if (!(socket.data as SocketData).authenticated) {
        logger.error(`Socket ${socket.id} not authenticated`);
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      logger.info(`Creating session for user ${(socket.data as SocketData).userId} with workingDir: ${message.workingDir}`);
      try {
        const sessionId = await manager.createSession({
          userId: (socket.data as SocketData).userId!,
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
      } catch (error: any) {
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

    // Handle session closing
    socket.on('close_session', (message: ClientToServerMessage) => {
      if (message.type !== 'close_session') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        manager.destroySession(message.sessionId);
        const closed: ServerToClientMessage = {
          type: 'session_closed',
          sessionId: message.sessionId,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_closed', closed);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: message.sessionId,
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_error', errorMessage);
      }
    });

    // Handle terminal resizing
    socket.on('resize_terminal', (message: ClientToServerMessage) => {
      if (message.type !== 'resize_terminal') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        manager.resizeSession(message.sessionId, message.cols, message.rows);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: message.sessionId,
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_error', errorMessage);
      }
    });

    // Handle list sessions request
    socket.on('list_sessions', (message: ClientToServerMessage) => {
      if (message.type !== 'list_sessions') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }

      try {
        const sessions = manager.getUserSessions((socket.data as SocketData).userId!);
        const response: ServerToClientMessage = {
          type: 'sessions_list',
          sessions: sessions.map(s => ({
            id: s.id,
            workingDir: s.workingDir,
            command: s.command,
            createdAt: s.createdAt.toISOString(),
            lastActivity: s.lastActivity.toISOString(),
            pid: s.pid
          })),
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('sessions_list', response);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'error',
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('error', errorMessage);
      }
    });

    // Handle get session info request
    socket.on('get_session_info', (message: ClientToServerMessage) => {
      if (message.type !== 'get_session_info') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }

      try {
        const sessionInfo = manager.getSessionInfo(message.sessionId);
        if (!sessionInfo) {
          throw new Error(`Session ${message.sessionId} not found`);
        }

        // Verify the session belongs to the authenticated user
        if (sessionInfo.userId !== (socket.data as SocketData).userId) {
          throw new Error('Unauthorized access to session');
        }

        const response: ServerToClientMessage = {
          type: 'session_info',
          sessionId: sessionInfo.id,
          sessionInfo: {
            workingDir: sessionInfo.workingDir,
            command: sessionInfo.command,
            createdAt: sessionInfo.createdAt.toISOString(),
            lastActivity: sessionInfo.lastActivity.toISOString(),
            pid: sessionInfo.pid
          },
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_info', response);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: message.sessionId,
          error: error.message,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_error', errorMessage);
      }
    });

    // Handle get session buffer request
    socket.on('get_session_buffer', (message: ClientToServerMessage) => {
      if (message.type !== 'get_session_buffer') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }

      try {
        const sessionInfo = manager.getSessionInfo(message.sessionId);
        if (!sessionInfo) {
          throw new Error(`Session ${message.sessionId} not found`);
        }

        // Verify the session belongs to the authenticated user
        if (sessionInfo.userId !== (socket.data as SocketData).userId) {
          throw new Error('Unauthorized access to session');
        }

        const buffer = manager.getSessionBuffer(message.sessionId);
        const response: ServerToClientMessage = {
          type: 'session_buffer',
          sessionId: message.sessionId,
          buffer,
          timestamp: Date.now(),
          requestId: message.id
        };
        socket.emit('session_buffer', response);
      } catch (error: any) {
        const errorMessage: ServerToClientMessage = {
          type: 'session_error',
          sessionId: message.sessionId,
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