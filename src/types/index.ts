import {IPty} from 'node-pty';

export interface Worktree {
	path: string;
	branch: string;
	isMainWorktree: boolean;
	hasSession: boolean;
}

export interface Session {
	id: string;
	worktreePath: string;
	process: IPty;
	state: 'idle' | 'busy' | 'waiting_input';
	output: string[]; // Recent output for state detection
	outputHistory: Buffer[]; // Full output history as buffers
	lastActivity: Date;
	isActive: boolean;
}

export interface SessionManager {
	sessions: Map<string, Session>;
	createSession(worktreePath: string): Session;
	getSession(worktreePath: string): Session | undefined;
	destroySession(worktreePath: string): void;
	getAllSessions(): Session[];
}