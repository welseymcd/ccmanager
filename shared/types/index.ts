// Shared types for CCManager Web

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  worktreeId: string;
  pid: number;
  status: 'active' | 'idle' | 'terminated';
  createdAt: Date;
  updatedAt: Date;
}

export interface Worktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TerminalData {
  sessionId: string;
  data: string;
}

export type SessionState = 'idle' | 'busy' | 'waiting_input';

// Re-export WebSocket types
export * from './websocket-messages';