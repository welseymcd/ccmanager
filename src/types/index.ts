import {IPty} from 'node-pty';

export type SessionState = 'idle' | 'busy' | 'waiting_input';

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
	state: SessionState;
	output: string[]; // Recent output for state detection
	outputHistory: Buffer[]; // Full output history as buffers
	lastActivity: Date;
	isActive: boolean;
	isRestored?: boolean; // True if this session was restored from database
}

export interface SessionManager {
	sessions: Map<string, Session>;
	createSession(worktreePath: string): Session;
	getSession(worktreePath: string): Session | undefined;
	destroySession(worktreePath: string): void;
	getAllSessions(): Session[];
}

export interface ShortcutKey {
	ctrl?: boolean;
	alt?: boolean;
	shift?: boolean;
	key: string;
}

export interface ShortcutConfig {
	returnToMenu: ShortcutKey;
	cancel: ShortcutKey;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
	returnToMenu: {ctrl: true, key: 'e'},
	cancel: {key: 'escape'},
};
