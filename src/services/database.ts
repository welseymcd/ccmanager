import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface SessionRecord {
	id?: number;
	worktree_path: string;
	output_buffer: string;
	state: 'idle' | 'busy' | 'waiting_input';
	created_at?: number;
	updated_at: number;
}

export class DatabaseService {
	private db: Database.Database;
	private dbPath: string;

	constructor() {
		const configDir =
			process.platform === 'win32'
				? path.join(process.env['APPDATA'] || os.homedir(), 'ccmanager')
				: path.join(os.homedir(), '.config', 'ccmanager');

		// Ensure config directory exists
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, {recursive: true});
		}

		this.dbPath = path.join(configDir, 'ccmanager.db');
		this.db = new Database(this.dbPath);

		// Enable foreign keys
		this.db.pragma('foreign_keys = ON');

		// Initialize schema
		this.initializeSchema();
	}

	private initializeSchema(): void {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worktree_path TEXT UNIQUE NOT NULL,
        output_buffer TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('idle', 'busy', 'waiting_input')),
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_worktree_path ON sessions(worktree_path);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
    `);
	}

	// Session operations
	saveSession(
		worktreePath: string,
		outputBuffer: string,
		state: SessionRecord['state'],
	): void {
		const stmt = this.db.prepare(`
      INSERT INTO sessions (worktree_path, output_buffer, state, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(worktree_path) DO UPDATE SET
        output_buffer = excluded.output_buffer,
        state = excluded.state,
        updated_at = excluded.updated_at
    `);

		stmt.run(worktreePath, outputBuffer, state, Date.now());
	}

	getSession(worktreePath: string): SessionRecord | undefined {
		const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE worktree_path = ?
    `);

		return stmt.get(worktreePath) as SessionRecord | undefined;
	}

	getAllSessions(): SessionRecord[] {
		const stmt = this.db.prepare(`
      SELECT * FROM sessions ORDER BY updated_at DESC
    `);

		return stmt.all() as SessionRecord[];
	}

	deleteSession(worktreePath: string): void {
		const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE worktree_path = ?
    `);

		stmt.run(worktreePath);
	}

	deleteOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
		const cutoffTime = Date.now() - maxAgeMs;
		const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE updated_at < ?
    `);

		stmt.run(cutoffTime);
	}

	close(): void {
		this.db.close();
	}
}

export const database = new DatabaseService();
