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
  cols?: number;
  rows?: number;
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

export interface ListSessionsMessage extends ClientMessage {
  type: 'list_sessions';
}

export interface GetSessionInfoMessage extends ClientMessage {
  type: 'get_session_info';
  sessionId: string;
}

export interface GetSessionBufferMessage extends ClientMessage {
  type: 'get_session_buffer';
  sessionId: string;
}

export type ClientToServerMessage = 
  | TerminalInputMessage
  | CreateSessionMessage
  | CloseSessionMessage
  | ResizeTerminalMessage
  | AuthenticateMessage
  | ListSessionsMessage
  | GetSessionInfoMessage
  | GetSessionBufferMessage;

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

export interface SessionsListMessage extends ServerMessage {
  type: 'sessions_list';
  sessions: Array<{
    id: string;
    workingDir: string;
    command: string;
    createdAt: string;
    lastActivity: string;
    pid: number;
  }>;
}

export interface SessionInfoMessage extends ServerMessage {
  type: 'session_info';
  sessionId: string;
  sessionInfo: {
    workingDir: string;
    command: string;
    createdAt: string;
    lastActivity: string;
    pid: number;
  };
}

export interface SessionBufferMessage extends ServerMessage {
  type: 'session_buffer';
  sessionId: string;
  buffer: string;
}

export interface ErrorMessage extends ServerMessage {
  type: 'error';
  error: string;
}

export type ServerToClientMessage = 
  | TerminalOutputMessage
  | SessionCreatedMessage
  | SessionClosedMessage
  | SessionErrorMessage
  | ConnectionStatusMessage
  | AuthenticationResultMessage
  | SessionsListMessage
  | SessionInfoMessage
  | SessionBufferMessage
  | ErrorMessage;

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
    
    case 'list_sessions':
      return true;
    
    case 'get_session_info':
      return typeof message.sessionId === 'string';
    
    case 'get_session_buffer':
      return typeof message.sessionId === 'string';
    
    default:
      return false;
  }
}