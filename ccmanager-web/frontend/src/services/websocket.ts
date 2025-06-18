import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { 
  ClientToServerMessage, 
  ServerToClientMessage 
} from '@shared/types/websocket-messages';

export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data?: any;
  error?: string;
  requestId?: string;
}

export interface WebSocketClientOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

interface QueuedMessage {
  message: ClientToServerMessage;
  resolve: (response: any) => void;
  reject: (error: any) => void;
}

export class WebSocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private requestCallbacks = new Map<string, (response: any) => void>();
  private messageQueue: QueuedMessage[] = [];
  private _isConnected = false;
  private authToken: string = '';
  private handlersSetup = false;

  constructor(private options: WebSocketClientOptions = {}) {
    super();
  }

  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already connected
      if (this.socket?.connected) {
        console.log('[WebSocket] Already connected, resolving immediately');
        this._isConnected = true;
        resolve();
        return;
      }
      
      // Check if connection is already in progress
      if (this.socket && !this.socket.connected && this.socket.io && this.socket.io.readyState === 'opening') {
        console.log('[WebSocket] Connection already in progress, waiting...');
        this.socket.once('connect', () => resolve());
        this.socket.once('connect_error', (error: any) => reject(error));
        return;
      }

      if (token) {
        this.authToken = token;
      }

      // Disconnect any existing socket before creating new one
      if (this.socket) {
        console.log('[WebSocket] Disconnecting existing socket...');
        this.socket.disconnect();
        this.socket = null;
        this.handlersSetup = false; // Reset handlers flag
      }

      console.log('[WebSocket] Creating new Socket.IO connection...');
      console.log('[WebSocket] Auth token present:', !!this.authToken);
      
      // Use relative URL for Socket.IO to work with proxy
      this.socket = io('/', {
        auth: { token: this.authToken },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.options.maxReconnectAttempts || 10,
        transports: ['websocket', 'polling'] // Try WebSocket first, then polling
      });

      console.log('[WebSocket] Socket.IO instance created');

      // Set up message handlers immediately after creating socket
      this.setupMessageHandlers();
      
      const handleConnect = () => {
        console.log('[WebSocket] Socket connected successfully!');
        console.log('[WebSocket] Socket ID:', this.socket!.id);
        this._isConnected = true;
        this.emit('connected');
        this.processQueuedMessages();
        resolve();
      };
      
      this.socket.once('connect', handleConnect);

      this.socket.on('connect_error', (error: any) => {
        console.error('[WebSocket] Connection error:', error.message);
        console.error('[WebSocket] Error type:', error.type);
        console.error('[WebSocket] Full error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocket] Disconnected. Reason:', reason);
        this._isConnected = false;
        this.emit('disconnected');
      });

      // Log Socket.IO internal events for debugging
      this.socket.io.on('error', (error) => {
        console.error('[WebSocket] Socket.IO error:', error);
      });

      this.socket.io.on('reconnect_attempt', (attempt) => {
        console.log('[WebSocket] Reconnection attempt:', attempt);
      });

      this.socket.io.on('reconnect', (attempt) => {
        console.log('[WebSocket] Reconnected after', attempt, 'attempts');
      });

      this.socket.io.on('reconnect_error', (error) => {
        console.error('[WebSocket] Reconnection error:', error);
      });

      this.socket.io.on('reconnect_failed', () => {
        console.error('[WebSocket] Reconnection failed after all attempts');
      });

      // Message handlers are set up after socket creation

      // Add a timeout to reject if connection takes too long
      const connectTimeout = setTimeout(() => {
        if (!this._isConnected) {
          console.error('[WebSocket] Connection timeout after 10 seconds');
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      // Clear timeout if connection succeeds or fails
      const clearTimeoutHandler = () => {
        clearTimeout(connectTimeout);
      };
      
      this.socket.once('connect', clearTimeoutHandler);
      this.socket.once('connect_error', clearTimeoutHandler);
    });
  }

  private setupMessageHandlers() {
    if (!this.socket) {
      console.error('[WebSocket] Cannot setup handlers - no socket');
      return;
    }
    
    if (this.handlersSetup) {
      console.log('[WebSocket] Handlers already set up, skipping');
      return;
    }
    
    this.handlersSetup = true;
    console.log('[WebSocket] Setting up message handlers...');

    // Handle all server messages
    const messageTypes: Array<ServerToClientMessage['type']> = [
      'terminal_output',
      'session_created',
      'session_closed',
      'session_error',
      'session_recreated',
      'connection_status',
      'authenticated',
      'authentication_error',
      'sessions_list',
      'session_buffer',
      'session_info',
      'error'
    ];

    console.log(`[WebSocket] Registering handlers for ${messageTypes.length} message types`);
    
    // Also register a catch-all handler to debug
    this.socket!.onAny((eventName: string, data: any) => {
      if (eventName === 'sessions_list' || eventName === 'session_created' || eventName === 'session_error') {
        console.log(`[WebSocket] Received event: ${eventName}`, data);
      }
    });
    
    messageTypes.forEach(type => {
      console.log(`[WebSocket] Registering handler for: ${type}`);
      this.socket!.on(type, (message: ServerToClientMessage) => {
        // Debug log for terminal output
        if (type === 'terminal_output') {
          console.log(`[WebSocket] Received terminal_output for session ${(message as any).sessionId}, data length: ${(message as any).data?.length || 0}`);
        }
        
        // Debug log all messages
        console.log(`[WebSocket] Received message type: ${type}, requestId: ${message.requestId}`);
        if (type === 'sessions_list' || type === 'session_created' || type === 'session_error') {
          console.log(`[WebSocket] Full message:`, message);
        }
        
        // Handle request callbacks - check both requestId and id fields
        const requestId = message.requestId || (message as any).id;
        if (requestId && this.requestCallbacks.has(requestId)) {
          console.log(`[WebSocket] Found callback for requestId: ${requestId}`);
          const callback = this.requestCallbacks.get(requestId)!;
          callback(message);
          this.requestCallbacks.delete(requestId);
        } else if (requestId) {
          console.log(`[WebSocket] No callback found for requestId: ${requestId}`);
          console.log(`[WebSocket] Available callbacks: ${Array.from(this.requestCallbacks.keys()).join(', ')}`);
        }

        // Emit message event
        // Only emit once per message to avoid duplicates
        this.emit('message', message);
        this.emit(type, message);
      });
    });
  }

  send(message: WebSocketMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.socket?.connected) {
          // Queue message if not connected
          this.messageQueue.push({ 
            message: message as ClientToServerMessage, 
            resolve, 
            reject 
          });
          return;
        }

        const requestId = this.generateRequestId();
        const messageWithId = { ...message, id: requestId, requestId }; // Include both for compatibility

        // Set up callback for response
        this.requestCallbacks.set(requestId, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });

        // Send message - Socket.IO expects event name and data separately
        // The message already has the type field, so we pass the entire message
        console.log(`[WebSocket] Sending message type: ${messageWithId.type}, with requestId: ${requestId}`);
        console.log(`[WebSocket] Message content:`, messageWithId);
        this.socket.emit(messageWithId.type, messageWithId);

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.requestCallbacks.has(requestId)) {
            console.error(`[WebSocket] Request ${requestId} timed out for message type: ${messageWithId.type}`);
            this.requestCallbacks.delete(requestId);
            reject(new Error(`Request timeout for ${messageWithId.type}`));
          }
        }, 30000);
      } catch (error) {
        console.error('Error sending message:', error);
        reject(error);
      }
    });
  }

  sendRaw(message: WebSocketMessage): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, queuing message');
      return;
    }
    this.socket.emit(message.type, message);
  }

  sendTerminalData(sessionId: string, data: string): void {
    this.sendRaw({
      type: 'terminal_input',
      sessionId,
      data
    });
  }

  subscribeToSession(sessionId: string): void {
    // Socket.IO automatically handles session subscriptions through events
    console.log('Subscribed to session:', sessionId);
  }

  unsubscribeFromSession(sessionId: string): void {
    // Socket.IO automatically handles session unsubscriptions
    console.log('Unsubscribed from session:', sessionId);
  }

  waitForConnection(timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._isConnected) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        this.off('connected', onConnect);
        reject(new Error('Connection timeout'));
      }, timeout);

      const onConnect = () => {
        clearTimeout(timer);
        resolve();
      };

      this.once('connected', onConnect);
    });
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._isConnected = false;
      this.handlersSetup = false;
    }
  }

  private processQueuedMessages(): void {
    while (this.messageQueue.length > 0) {
      const { message, resolve, reject } = this.messageQueue.shift()!;
      this.send(message).then(resolve).catch(reject);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance - store on window to survive HMR
declare global {
  interface Window {
    __webSocketClient?: WebSocketClient;
  }
}

export function getWebSocketClient(options?: WebSocketClientOptions): WebSocketClient {
  if (!window.__webSocketClient) {
    console.log('[WebSocket] Creating new WebSocket client instance');
    window.__webSocketClient = new WebSocketClient(options);
  }
  return window.__webSocketClient;
}