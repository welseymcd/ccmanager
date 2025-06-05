import {spawn} from 'node-pty';
import {Session, SessionManager as ISessionManager} from '../types/index.js';
import {EventEmitter} from 'events';

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private stateDetectionInterval: NodeJS.Timeout | null = null;

	constructor() {
		super();
		this.sessions = new Map();
		this.startStateDetection();
	}

	createSession(worktreePath: string): Session {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			return existing;
		}

		const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		
		const ptyProcess = spawn('claude', [], {
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: worktreePath,
			env: process.env,
		});

		const session: Session = {
			id,
			worktreePath,
			process: ptyProcess,
			state: 'idle',
			output: [],
			lastActivity: new Date(),
			isActive: false,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(worktreePath, session);
		this.emit('sessionCreated', session);

		return session;
	}

	private setupBackgroundHandler(session: Session): void {
		// This handler always runs for all data
		session.process.onData((data: string) => {
			// Always store output for state detection
			session.output.push(data);
			// Keep only last 100 chunks for state detection
			if (session.output.length > 100) {
				session.output.shift();
			}
			session.lastActivity = new Date();
			this.detectState(session);
			
			// Only emit data events when session is active
			if (session.isActive) {
				this.emit('sessionData', session, data);
			}
		});

		session.process.onExit(() => {
			this.destroySession(session.worktreePath);
			this.emit('sessionExit', session);
		});
	}

	getSession(worktreePath: string): Session | undefined {
		return this.sessions.get(worktreePath);
	}

	setSessionActive(worktreePath: string, active: boolean): void {
		const session = this.sessions.get(worktreePath);
		if (session) {
			session.isActive = active;
		}
	}

	destroySession(worktreePath: string): void {
		const session = this.sessions.get(worktreePath);
		if (session) {
			try {
				session.process.kill();
			} catch (error) {
				// Process might already be dead
			}
			this.sessions.delete(worktreePath);
			this.emit('sessionDestroyed', session);
		}
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	private detectState(session: Session): void {
		const recentOutput = session.output.slice(-10).join('');
		
		// Detect waiting for input
		if (recentOutput.includes('> ') || 
			recentOutput.includes('Press Enter to continue') ||
			recentOutput.includes('? ')) {
			session.state = 'waiting_input';
		} 
		// Detect busy state
		else if (Date.now() - session.lastActivity.getTime() < 1000) {
			session.state = 'busy';
		}
		// Default to idle
		else {
			session.state = 'idle';
		}
	}

	private startStateDetection(): void {
		// Periodically check session states
		this.stateDetectionInterval = setInterval(() => {
			for (const session of this.sessions.values()) {
				const timeSinceActivity = Date.now() - session.lastActivity.getTime();
				if (timeSinceActivity > 5000 && session.state === 'busy') {
					session.state = 'idle';
					this.emit('sessionStateChanged', session);
				}
			}
		}, 1000);
	}

	destroy(): void {
		if (this.stateDetectionInterval) {
			clearInterval(this.stateDetectionInterval);
		}
		
		// Clean up all sessions
		for (const worktreePath of this.sessions.keys()) {
			this.destroySession(worktreePath);
		}
	}
}