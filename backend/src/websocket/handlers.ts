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

  // Listen to SessionManager events for all sessions
  manager.on('sessionData', ({ sessionId, data }) => {
    logger.info(`[WebSocket] ====== SESSION DATA EVENT ======`);
    logger.info(`[WebSocket] SessionManager emitted sessionData`);
    logger.info(`[WebSocket] Session ID: ${sessionId}`);
    logger.info(`[WebSocket] Data length: ${data.length}`);
    logger.info(`[WebSocket] Data preview: ${JSON.stringify(data.substring(0, 50))}`);
    
    const outputMessage: ServerToClientMessage = {
      type: 'terminal_output',
      sessionId,
      data,
      timestamp: Date.now()
    };
    
    logger.info(`[WebSocket] Emitting terminal_output to ${io.sockets.sockets.size} clients`);
    io.emit('terminal_output', outputMessage);
    logger.info(`[WebSocket] ================================`);
  });

  manager.on('sessionExit', ({ sessionId, exitCode }) => {
    const closedMessage: ServerToClientMessage = {
      type: 'session_closed',
      sessionId,
      exitCode,
      timestamp: Date.now()
    };
    io.emit('session_closed', closedMessage);
  });

  manager.on('sessionStateChanged', ({ sessionId, state, previousState }) => {
    logger.info(`Session ${sessionId} state changed from ${previousState} to ${state}`);
    const stateMessage: ServerToClientMessage = {
      type: 'session_state_changed',
      sessionId,
      state,
      previousState,
      timestamp: Date.now()
    };
    io.emit('session_state_changed', stateMessage);
  });

  io.use(authenticateSocket);

  // Log when clients connect/disconnect
  io.on('connection', (socket: Socket) => {
    logger.info(`[WebSocket] New connection established: ${socket.id}`);
    logger.info(`[WebSocket] Total connected clients: ${io.sockets.sockets.size}`);
    logger.info(`[WebSocket] Socket authenticated: ${(socket.data as SocketData).authenticated}`);
    logger.info(`[WebSocket] Socket userId: ${(socket.data as SocketData).userId || 'none'}`);
    
    // Send initial connection status
    const connectionMessage: ServerToClientMessage = {
      type: 'connection_status',
      status: 'connected',
      timestamp: Date.now()
    };
    socket.emit('connection_status', connectionMessage);
    logger.info(`[WebSocket] Sent connection_status message to ${socket.id}`);

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
    socket.on('terminal_input', async (message: ClientToServerMessage) => {
      logger.info(`[WebSocket] ====== TERMINAL INPUT RECEIVED ======`);
      logger.info(`[WebSocket] From socket: ${socket.id}`);
      logger.info(`[WebSocket] Message type: ${message.type}`);
      logger.info(`[WebSocket] Session ID: ${(message as any).sessionId}`);
      logger.info(`[WebSocket] Data: ${JSON.stringify((message as any).data)}`);
      logger.info(`[WebSocket] Data length: ${(message as any).data?.length || 0}`);
      logger.info(`[WebSocket] ===================================`);
      
      if (message.type !== 'terminal_input') return;
      if (!(socket.data as SocketData).authenticated) {
        logger.error(`[WebSocket] Socket ${socket.id} not authenticated for terminal_input`);
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        logger.debug(`[WebSocket] Calling writeToSession for session ${message.sessionId}`);
        await manager.writeToSession(message.sessionId, message.data);
      } catch (error: any) {
        // If session not found, try to recreate it
        if (error.message.includes('not found')) {
          logger.info(`Session ${message.sessionId} not found, attempting to recreate`);
          
          try {
            // Get session info from database
            const sessionInfo = await sessionHistoryManager.getSession(message.sessionId);
            if (sessionInfo && sessionInfo.status === 'active') {
              // Recreate the session with the same ID
              const newSessionId = await manager.recreateSession({
                sessionId: message.sessionId,
                userId: sessionInfo.user_id,
                workingDir: sessionInfo.working_dir,
                command: sessionInfo.command,
                cols: 80,
                rows: 24,
                onData: (_data: string) => {
                  // The SessionManager will emit sessionData event which is handled globally
                },
                onExit: (_exitCode: number) => {
                  // The SessionManager will emit sessionExit event which is handled globally
                }
              });
              
              // Try writing again
              manager.writeToSession(newSessionId, message.data);
              
              // Notify client that session was recreated
              const recreatedMessage: ServerToClientMessage = {
                type: 'session_recreated',
                sessionId: newSessionId,
                timestamp: Date.now()
              };
              socket.emit('session_recreated', recreatedMessage);
              
              return;
            }
          } catch (recreateError: any) {
            logger.error(`Failed to recreate session: ${recreateError.message}`);
          }
        }
        
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
        logger.info(`About to call manager.createSession...`);
        const sessionId = await manager.createSession({
          userId: (socket.data as SocketData).userId!,
          workingDir: message.workingDir,
          command: message.command,
          cols: message.cols,
          rows: message.rows,
          onData: (_data: string) => {
            // The SessionManager will emit sessionData event which is handled globally
            // This ensures all sessions (including reattached ones) work correctly
          },
          onExit: (_exitCode: number) => {
            // The SessionManager will emit sessionExit event which is handled globally
          }
        });
        
        logger.info(`Session created successfully with ID: ${sessionId}`);
        
        const created: ServerToClientMessage = {
          type: 'session_created',
          sessionId,
          workingDir: message.workingDir || process.cwd(),
          timestamp: Date.now(),
          requestId: message.id
        };
        logger.info(`Emitting session_created response with requestId: ${message.id}`);
        socket.emit('session_created', created);
      } catch (error: any) {
        logger.error(`Failed to create session: ${error.message}`, { stack: error.stack });
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
    socket.on('resize_terminal', async (message: ClientToServerMessage) => {
      if (message.type !== 'resize_terminal') return;
      if (!(socket.data as SocketData).authenticated) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      try {
        await manager.resizeSession(message.sessionId, message.cols, message.rows);
      } catch (error: any) {
        logger.error(`Failed to resize terminal for session ${message.sessionId}: ${error.message}`, {
          sessionId: message.sessionId,
          cols: message.cols,
          rows: message.rows,
          error: error.stack
        });
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
      logger.info(`[WebSocket] Received list_sessions request from ${socket.id}`);
      if (message.type !== 'list_sessions') {
        logger.error(`[WebSocket] Invalid message type for list_sessions: ${message.type}`);
        return;
      }
      if (!(socket.data as SocketData).authenticated) {
        logger.error(`[WebSocket] Socket ${socket.id} not authenticated for list_sessions`);
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }

      try {
        const userId = (socket.data as SocketData).userId!;
        logger.info(`[WebSocket] Getting sessions for user: ${userId}`);
        const sessions = manager.getUserSessions(userId);
        logger.info(`[WebSocket] Found ${sessions.length} sessions for user ${userId}`);
        
        const response: ServerToClientMessage = {
          type: 'sessions_list',
          sessions: sessions.map(s => ({
            id: s.id,
            workingDir: s.workingDir,
            command: s.command,
            createdAt: s.createdAt.toISOString(),
            lastActivity: s.lastActivity.toISOString(),
            pid: s.pid,
            state: s.state
          })),
          timestamp: Date.now(),
          requestId: message.id
        };
        logger.info(`[WebSocket] Sending sessions_list response with requestId: ${message.id}`);
        socket.emit('sessions_list', response);
      } catch (error: any) {
        logger.error(`[WebSocket] Error listing sessions: ${error.message}`);
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
            pid: sessionInfo.pid,
            state: sessionInfo.state
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
    socket.on('get_session_buffer', async (message: ClientToServerMessage) => {
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

        // Ensure the session is properly attached if using tmux
        const session = manager.getSession(message.sessionId);
        if (session && !session.pty && manager.isUsingTmux()) {
          logger.info(`Session ${message.sessionId} has no PTY when getting buffer, attempting to reattach`);
          await manager.ensureSessionAttached(message.sessionId);
        }

        // First try to get buffer from database (persistent across server restarts)
        let buffer = '';
        try {
          const history = await sessionHistoryManager.getRecentHistory(message.sessionId, 5000);
          if (history.length > 0) {
            // Reconstruct the terminal output from history
            // Simply concatenate the content as it was stored with original formatting
            buffer = history.map(line => line.content).join('');
            logger.info(`Restored ${history.length} lines from database for session ${message.sessionId}`);
          }
        } catch (dbError) {
          logger.warn(`Could not restore from database: ${dbError}`);
        }
        
        // If no database history, fall back to in-memory buffer or tmux
        if (!buffer) {
          buffer = await manager.getSessionBuffer(message.sessionId);
          if (buffer) {
            logger.info(`Using buffer for session ${message.sessionId}`);
          }
        }
        
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

    // Handle refresh terminal request (force refresh of terminal buffer)
    socket.on('refresh_terminal', async (message: ClientToServerMessage) => {
      if (message.type !== 'refresh_terminal') return;
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

        // Get the session buffer to refresh
        const buffer = await manager.getSessionBuffer(message.sessionId);
        if (buffer) {
          logger.info(`Refreshing terminal for session ${message.sessionId}, buffer size: ${buffer.length}`);
          
          // Send the buffer as terminal output
          const outputMessage: ServerToClientMessage = {
            type: 'terminal_output',
            sessionId: message.sessionId,
            data: buffer,
            timestamp: Date.now()
          };
          socket.emit('terminal_output', outputMessage);
        }
      } catch (error: any) {
        logger.error(`Failed to refresh terminal for session ${message.sessionId}: ${error.message}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`WebSocket disconnected: ${socket.id}`);
      // Sessions remain active for reconnection
    });
  });
}