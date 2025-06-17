import {spawn, IPty} from 'node-pty';
import {
	Session,
	SessionManager as ISessionManager,
	SessionState,
} from '../types/index.js';
import {EventEmitter} from 'events';
import {includesPromptBoxBottomBorder} from '../utils/promptDetector.js';
import {sessionPersistence} from './sessionPersistence.js';

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private waitingWithBottomBorder: Map<string, boolean> = new Map();
	private busyTimers: Map<string, NodeJS.Timeout> = new Map();

	private stripAnsi(str: string): string {
		// Remove all ANSI escape sequences including cursor movement, color codes, etc.
		return str
			.replace(/\x1b\[[0-9;]*m/g, '') // Color codes (including 24-bit)
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
			.replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences
			.replace(/\x1b[PX^_].*?\x1b\\/g, '') // DCS/PM/APC/SOS sequences
			.replace(/\x1b\[\?[0-9;]*[hl]/g, '') // Private mode sequences
			.replace(/\x1b[>=]/g, '') // Other escape sequences
			.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '') // Control characters except newline (\x0A)
			.replace(/\r/g, '') // Carriage returns
			.replace(/^[0-9;]+m/gm, '') // Orphaned color codes at line start
			.replace(/[0-9]+;[0-9]+;[0-9;]+m/g, ''); // Orphaned 24-bit color codes
	}

	detectSessionState(
		cleanData: string,
		currentState: SessionState,
		sessionId: string,
	): SessionState {
		const hasBottomBorder = includesPromptBoxBottomBorder(cleanData);
		const hasWaitingPrompt =
			cleanData.includes('│ Do you want') ||
			cleanData.includes('│ Would you like');
		const wasWaitingWithBottomBorder =
			this.waitingWithBottomBorder.get(sessionId) || false;
		const hasEscToInterrupt = cleanData
			.toLowerCase()
			.includes('esc to interrupt');

		let newState = currentState;

		// Check if current state is waiting and this is just a prompt box bottom border
		if (hasWaitingPrompt) {
			newState = 'waiting_input';
			// Check if this same data also contains the bottom border
			if (hasBottomBorder) {
				this.waitingWithBottomBorder.set(sessionId, true);
			} else {
				this.waitingWithBottomBorder.set(sessionId, false);
			}
			// Clear any pending busy timer
			const existingTimer = this.busyTimers.get(sessionId);
			if (existingTimer) {
				clearTimeout(existingTimer);
				this.busyTimers.delete(sessionId);
			}
		} else if (
			currentState === 'waiting_input' &&
			hasBottomBorder &&
			!hasWaitingPrompt &&
			!wasWaitingWithBottomBorder
		) {
			// Keep the waiting state and mark that we've seen the bottom border
			newState = 'waiting_input';
			this.waitingWithBottomBorder.set(sessionId, true);
			// Clear any pending busy timer
			const existingTimer = this.busyTimers.get(sessionId);
			if (existingTimer) {
				clearTimeout(existingTimer);
				this.busyTimers.delete(sessionId);
			}
		} else if (hasEscToInterrupt) {
			// If "esc to interrupt" is present, set state to busy
			newState = 'busy';
			this.waitingWithBottomBorder.set(sessionId, false);
			// Clear any pending timer since we're confirming busy state
			const existingTimer = this.busyTimers.get(sessionId);
			if (existingTimer) {
				clearTimeout(existingTimer);
				this.busyTimers.delete(sessionId);
			}
		} else if (currentState === 'busy' && !hasEscToInterrupt) {
			// If we were busy but no "esc to interrupt" in current data,
			// start a timer to switch to idle after 500ms
			if (!this.busyTimers.has(sessionId)) {
				const timer = setTimeout(() => {
					// sessionId is actually the worktreePath
					const session = this.sessions.get(sessionId);
					if (session && session.state === 'busy') {
						session.state = 'idle';
						this.emit('sessionStateChanged', session);
					}
					this.busyTimers.delete(sessionId);
				}, 500);
				this.busyTimers.set(sessionId, timer);
			}
			// Keep current busy state for now
			newState = 'busy';
		}

		return newState;
	}

	constructor() {
		super();
		this.sessions = new Map();

		// Restore sessions from database on startup
		this.restoreSessions();

		// Set up periodic session saving
		this.startPeriodicSave();
	}

	createSession(worktreePath: string): Session {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			// If it's a restored session without a process, create the process
			if (existing.isRestored && !existing.process) {
				console.log(
					'[SessionManager] Creating process for restored session:',
					worktreePath,
				);
				this.createProcessForRestoredSession(existing);
			}
			return existing;
		}

		const id = `session-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;

		// Parse Claude command arguments from environment variable
		const claudeArgs = process.env['CCMANAGER_CLAUDE_ARGS']
			? process.env['CCMANAGER_CLAUDE_ARGS'].split(' ')
			: [];

		const ptyProcess = spawn('claude', claudeArgs, {
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
			state: 'busy', // Session starts as busy when created
			output: [],
			outputHistory: [],
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
			// Store in output history as Buffer
			const buffer = Buffer.from(data, 'utf8');
			session.outputHistory.push(buffer);

			// Limit memory usage - keep max 10MB of output history
			const MAX_HISTORY_SIZE = 10 * 1024 * 1024; // 10MB
			let totalSize = session.outputHistory.reduce(
				(sum, buf) => sum + buf.length,
				0,
			);
			while (totalSize > MAX_HISTORY_SIZE && session.outputHistory.length > 0) {
				const removed = session.outputHistory.shift();
				if (removed) {
					totalSize -= removed.length;
				}
			}

			// Also store for state detection
			session.output.push(data);
			// Keep only last 100 chunks for state detection
			if (session.output.length > 100) {
				session.output.shift();
			}

			session.lastActivity = new Date();

			// Strip ANSI codes for pattern matching
			const cleanData = this.stripAnsi(data);

			// Skip state monitoring if cleanData is empty
			if (!cleanData.trim()) {
				// Only emit data events when session is active
				if (session.isActive) {
					this.emit('sessionData', session, data);
				}
				return;
			}

			// Detect state based on the new data
			const oldState = session.state;
			const newState = this.detectSessionState(
				cleanData,
				oldState,
				session.worktreePath,
			);

			// Update state if changed
			if (newState !== oldState) {
				session.state = newState;
				this.emit('sessionStateChanged', session);
				// Save session state to database
				this.saveSessionToDb(session);
			}

			// Only emit data events when session is active
			if (session.isActive) {
				this.emit('sessionData', session, data);
			}
		});

		session.process.onExit(() => {
			// Update state to idle before destroying
			session.state = 'idle';
			this.emit('sessionStateChanged', session);
			// Delete session from database when it exits
			sessionPersistence.deleteSession(session.worktreePath);
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

			// If becoming active, emit a restore event with the output history
			if (active && session.outputHistory.length > 0) {
				console.log(
					'[SessionManager] Emitting sessionRestore for:',
					session.worktreePath,
					'output size:',
					session.outputHistory.length,
				);
				this.emit('sessionRestore', session);
			}
		}
	}

	destroySession(worktreePath: string): void {
		const session = this.sessions.get(worktreePath);
		if (session) {
			try {
				session.process.kill();
			} catch (_error) {
				// Process might already be dead
			}
			// Clean up any pending timer
			const timer = this.busyTimers.get(worktreePath);
			if (timer) {
				clearTimeout(timer);
				this.busyTimers.delete(worktreePath);
			}
			this.sessions.delete(worktreePath);
			this.waitingWithBottomBorder.delete(session.id);
			this.emit('sessionDestroyed', session);
		}
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	destroy(): void {
		// Save all sessions before destroying
		this.saveAllSessions();

		// Stop periodic save timer
		if (this.periodicSaveTimer) {
			clearInterval(this.periodicSaveTimer);
		}

		// Clean up all sessions
		for (const worktreePath of this.sessions.keys()) {
			this.destroySession(worktreePath);
		}
	}

	private periodicSaveTimer?: NodeJS.Timeout;

	private startPeriodicSave(): void {
		// Save sessions every 5 seconds
		this.periodicSaveTimer = setInterval(() => {
			this.saveAllSessions();
		}, 5000);
	}

	private saveSessionToDb(session: Session): void {
		// Convert output history to string
		const outputBuffer = session.outputHistory
			.map(buf => buf.toString('utf8'))
			.join('');

		sessionPersistence.saveSession(session.worktreePath, {
			worktreePath: session.worktreePath,
			outputBuffer,
			state: session.state,
			lastUpdated: Date.now(),
		});
	}

	private saveAllSessions(): void {
		for (const session of this.sessions.values()) {
			this.saveSessionToDb(session);
		}
	}

	private async restoreSessions(): Promise<void> {
		try {
			const savedSessions = await sessionPersistence.loadSessions();
			console.log(
				'[SessionManager] Loaded saved sessions:',
				savedSessions.length,
			);

			for (const savedSession of savedSessions) {
				console.log(
					'[SessionManager] Restoring session:',
					savedSession.worktreePath,
					'buffer size:',
					savedSession.outputBuffer.length,
				);
				// Create a dummy session object to hold the restored data
				// We'll create the actual PTY process when the user activates the session
				// Only restore if there's actual output to restore
				if (
					!savedSession.outputBuffer ||
					savedSession.outputBuffer.length === 0
				) {
					console.log(
						'[SessionManager] Skipping session with empty buffer:',
						savedSession.worktreePath,
					);
					continue;
				}

				const restoredSession: Session = {
					id: `restored-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					worktreePath: savedSession.worktreePath,
					process: null as unknown as IPty, // Will be created on activation
					state: savedSession.state,
					output: [],
					outputHistory: [Buffer.from(savedSession.outputBuffer, 'utf8')],
					lastActivity: new Date(savedSession.lastUpdated),
					isActive: false,
					isRestored: true,
				};

				this.sessions.set(savedSession.worktreePath, restoredSession);
				this.emit('sessionRestored', restoredSession);
			}
		} catch (error) {
			console.error('Failed to restore sessions:', error);
		}
	}

	private createProcessForRestoredSession(session: Session): void {
		// Parse Claude command arguments from environment variable
		const claudeArgs = process.env['CCMANAGER_CLAUDE_ARGS']
			? process.env['CCMANAGER_CLAUDE_ARGS'].split(' ')
			: [];

		const ptyProcess = spawn('claude', claudeArgs, {
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: session.worktreePath,
			env: process.env,
		});

		session.process = ptyProcess;
		// Keep isRestored as true so the Session component knows to restore output

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		// Emit event that the session is now fully active
		this.emit('sessionCreated', session);
	}
}
