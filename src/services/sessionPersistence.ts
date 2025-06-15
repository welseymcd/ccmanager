import {database} from './database.js';

export interface PersistedSession {
	worktreePath: string;
	outputBuffer: string;
	state: 'idle' | 'busy' | 'waiting_input';
	lastUpdated: number;
}

export class SessionPersistence {
	constructor() {
		// Clean up old sessions on startup
		this.cleanupOldSessions();
	}

	private cleanupOldSessions(): void {
		try {
			// Delete sessions older than 24 hours
			database.deleteOldSessions(24 * 60 * 60 * 1000);
		} catch (error) {
			console.error('Failed to cleanup old sessions:', error);
		}
	}

	async saveSessions(sessions: Map<string, PersistedSession>): Promise<void> {
		try {
			for (const [worktreePath, session] of sessions.entries()) {
				database.saveSession(worktreePath, session.outputBuffer, session.state);
			}
		} catch (error) {
			console.error('Failed to save sessions:', error);
		}
	}

	async saveSession(
		worktreePath: string,
		session: PersistedSession,
	): Promise<void> {
		try {
			database.saveSession(worktreePath, session.outputBuffer, session.state);
		} catch (error) {
			console.error('Failed to save session:', error);
		}
	}

	async loadSessions(): Promise<PersistedSession[]> {
		try {
			const dbSessions = database.getAllSessions();

			return dbSessions.map(session => ({
				worktreePath: session.worktree_path,
				outputBuffer: session.output_buffer,
				state: session.state,
				lastUpdated: session.updated_at,
			}));
		} catch (error) {
			console.error('Failed to load sessions:', error);
			return [];
		}
	}

	async getSession(
		worktreePath: string,
	): Promise<PersistedSession | undefined> {
		try {
			const session = database.getSession(worktreePath);
			if (!session) return undefined;

			return {
				worktreePath: session.worktree_path,
				outputBuffer: session.output_buffer,
				state: session.state,
				lastUpdated: session.updated_at,
			};
		} catch (error) {
			console.error('Failed to get session:', error);
			return undefined;
		}
	}

	async deleteSession(worktreePath: string): Promise<void> {
		try {
			database.deleteSession(worktreePath);
		} catch (error) {
			console.error('Failed to delete session:', error);
		}
	}

	async clearSessions(): Promise<void> {
		try {
			database.deleteOldSessions(0); // Delete all sessions
		} catch (error) {
			console.error('Failed to clear sessions:', error);
		}
	}
}

export const sessionPersistence = new SessionPersistence();
