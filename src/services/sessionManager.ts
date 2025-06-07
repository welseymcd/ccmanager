import {spawn} from 'node-pty';
import {Session, SessionManager as ISessionManager} from '../types/index.js';
import {EventEmitter} from 'events';
import {logger} from '../utils/logger.js';
import {
	isPromptBoxOnly,
	isUpdateSuggestionOnly,
	isWaitingForInput,
} from '../utils/promptDetector.js';

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private stateDetectionInterval: NodeJS.Timeout | null = null;
	private previousOutputs: Map<string, string> = new Map();
	private lastReceivedData: Map<string, string> = new Map();

	private stripAnsi(str: string): string {
		// Remove all ANSI escape sequences including cursor movement, color codes, etc.
		return str
			.replace(/\x1b\[[0-9;]*m/g, '') // Color codes (including 24-bit)
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
			.replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences
			.replace(/\x1b[PX^_].*?\x1b\\/g, '') // DCS/PM/APC/SOS sequences
			.replace(/\x1b\[\?[0-9;]*[hl]/g, '') // Private mode sequences
			.replace(/\x1b[>=]/g, '') // Other escape sequences
			.replace(/[\x00-\x1F\x7F]/g, '') // Control characters
			.replace(/\r/g, '') // Carriage returns
			.replace(/^[0-9;]+m/gm, '') // Orphaned color codes at line start
			.replace(/[0-9]+;[0-9]+;[0-9;]+m/g, ''); // Orphaned 24-bit color codes
	}

	constructor() {
		super();
		this.sessions = new Map();
		this.previousOutputs = new Map();
		this.lastReceivedData = new Map();
		this.startStateDetection();
	}

	createSession(worktreePath: string): Session {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			return existing;
		}

		const id = `session-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;

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
			state: 'busy', // Session starts as busy when created
			output: [],
			outputHistory: [],
			lastActivity: new Date(),
			isActive: false,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(worktreePath, session);

		// Initialize previous output tracking
		this.previousOutputs.set(session.id, '');
		this.lastReceivedData.set(session.id, '');

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

			// Store the latest received data for diff tracking
			this.lastReceivedData.set(session.id, data);

			session.lastActivity = new Date();
			this.detectState(session);

			// Only emit data events when session is active
			if (session.isActive) {
				this.emit('sessionData', session, data);
			}
		});

		session.process.onExit(() => {
			// Update state to idle before destroying
			session.state = 'idle';
			this.emit('sessionStateChanged', session);
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
			this.sessions.delete(worktreePath);
			// Clean up previous output tracking
			this.previousOutputs.delete(session.id);
			this.lastReceivedData.delete(session.id);
			this.emit('sessionDestroyed', session);
		}
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	private detectState(session: Session): void {
		// Get the full output for pattern matching
		const fullOutput = session.output.join('');
		const previousFullOutput = this.previousOutputs.get(session.id) || '';
		const oldState = session.state;

		// Get the most recently received data chunk
		const latestData = this.lastReceivedData.get(session.id) || '';

		// Store current full output for next comparison
		this.previousOutputs.set(session.id, fullOutput);

		// Check if we have new output by comparing full outputs
		const hasNewOutput =
			fullOutput.length > previousFullOutput.length && latestData.length > 0;

		// For pattern matching, look at the new output since last check
		const recentOutput = fullOutput.slice(previousFullOutput.length);

		// Strip ANSI codes for pattern matching
		const cleanRecentOutput = this.stripAnsi(recentOutput);

		// Early return if no output to process
		if (!cleanRecentOutput.trim()) {
			return;
		}

		if (
			// Check if output is just a prompt box
			isPromptBoxOnly(cleanRecentOutput) ||
			isUpdateSuggestionOnly(cleanRecentOutput)
		) {
			// Don't change state for prompt box only output
			return;
		}

		logger.warn(
			'DEBUGPRINT[98]: sessionManager.ts:158: cleanRecentOutput=',
			cleanRecentOutput,
		);

		// Check if waiting for input using actual Claude patterns
		const isWaiting = isWaitingForInput(cleanRecentOutput);

		// Determine state based on patterns and activity
		let newState = oldState; // Start with current state

		if (isWaiting) {
			newState = 'waiting_input';
		} else if (hasNewOutput) {
			// If we have new output, session is active
			newState = 'busy';
		} else {
			// No new output and no waiting patterns
			const timeSinceActivity = Date.now() - session.lastActivity.getTime();
			if (timeSinceActivity > 3000) {
				newState = 'idle';
			}
			// else keep current state
		}

		// Update state and emit event if changed
		if (newState !== oldState) {
			session.state = newState;
			this.emit('sessionStateChanged', session);
		}
	}

	private startStateDetection(): void {
		// Periodically check session states
		this.stateDetectionInterval = setInterval(() => {
			for (const session of this.sessions.values()) {
				// Always run detectState to ensure continuous monitoring
				// This ensures state updates even for background sessions
				this.detectState(session);
			}
		}, 500); // Check every 500ms for more responsive updates
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
