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
      if (this.socket?.connected) {
        resolve();
        return;
      }

      if (token) {
        this.authToken = token;
      }

      // Use relative URL for Socket.IO to work with proxy
      this.socket = io('/', {
        auth: { token: this.authToken },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.options.maxReconnectAttempts || 10
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this._isConnected = true;
        this.emit('connected');
        this.processQueuedMessages();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        this._isConnected = false;
        this.emit('disconnected');
      });

      // Set up message handlers
      this.setupMessageHandlers();
    });
  }

  private setupMessageHandlers() {
    if (!this.socket || this.handlersSetup) return;
    
    this.handlersSetup = true;

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

    messageTypes.forEach(type => {
      this.socket!.on(type, (message: ServerToClientMessage) => {
        // Debug log for terminal output
        if (type === 'terminal_output') {
          console.log(`[WebSocket] Received terminal_output for session ${(message as any).sessionId}, data length: ${(message as any).data?.length || 0}`);
        }
        
        // Debug log all messages
        console.log(`[WebSocket] Received message type: ${type}, requestId: ${message.requestId}`);
        
        // Handle request callbacks
        if (message.requestId && this.requestCallbacks.has(message.requestId)) {
          console.log(`[WebSocket] Found callback for requestId: ${message.requestId}`);
          const callback = this.requestCallbacks.get(message.requestId)!;
          callback(message);
          this.requestCallbacks.delete(message.requestId);
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
        const messageWithId = { ...message, id: requestId };

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
        this.socket.emit(messageWithId.type, messageWithId);

        // Timeout after 30 seconds
        const timeoutId = setTimeout(() => {
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