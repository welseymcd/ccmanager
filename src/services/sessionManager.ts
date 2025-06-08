import {spawn} from 'node-pty';
import {Session, SessionManager as ISessionManager} from '../types/index.js';
import {EventEmitter} from 'events';
import {
	isPromptBoxOnly,
	isUpdateSuggestionOnly,
	isWaitingForInput,
} from '../utils/promptDetector.js';
import {logger} from '../utils/logger.js';

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private stateDetectionInterval: NodeJS.Timeout | null = null;
	private previousOutputs: Map<string, string> = new Map();
	private lastReceivedData: Map<string, string> = new Map();
	private waitingStateTracker: Map<string, boolean> = new Map();
	private escToInterruptTracker: Map<string, boolean> = new Map();
	private waitingForNonPromptOutput: Map<string, boolean> = new Map();

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

	private isPromptBoxBottomBorder(output: string): boolean {
		// Check if the output is just a prompt box bottom border
		const trimmed = output.trim();
		// Match pattern like ╰────────────────╯ with any number of ─ characters
		return /^╰─+╯$/.test(trimmed);
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
		this.waitingStateTracker.set(session.id, false);
		this.escToInterruptTracker.set(session.id, false);
		this.waitingForNonPromptOutput.set(session.id, false);

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
			this.waitingStateTracker.delete(session.id);
			this.escToInterruptTracker.delete(session.id);
			this.waitingForNonPromptOutput.delete(session.id);
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
		const timeSinceActivity = Date.now() - session.lastActivity.getTime();
		const waitingForNonPrompt =
			this.waitingForNonPromptOutput.get(session.id) || false;

		// Check for timeout-based idle even if no new output
		if (!cleanRecentOutput.trim()) {
			// No new output, but still check for idle timeout
			// Only transition to idle if:
			// 1. Not waiting for input
			// 2. Enough time has passed (3 seconds)
			// 3. Not waiting for non-prompt output after "esc to interrupt"
			if (
				!waitingForNonPrompt &&
				timeSinceActivity > 3000 &&
				session.state !== 'idle' &&
				session.state !== 'waiting_input'
			) {
				session.state = 'idle';
				this.waitingStateTracker.set(session.id, false);
				this.emit('sessionStateChanged', session);
			}
			// If waitingForNonPrompt is true, we stay in current state (busy) waiting for real output
			return;
		}

		// Check if output contains "esc to interrupt"
		const hasEscToInterrupt = cleanRecentOutput
			.toLowerCase()
			.includes('esc to interrupt');
		const wasEscToInterruptActive =
			this.escToInterruptTracker.get(session.id) || false;

		// Update esc to interrupt tracker
		if (hasEscToInterrupt) {
			this.escToInterruptTracker.set(session.id, true);
			this.waitingForNonPromptOutput.set(session.id, true);
		}

		// Check if output is just a prompt box
		const isPromptBox = isPromptBoxOnly(cleanRecentOutput);

		if (isPromptBox || isUpdateSuggestionOnly(cleanRecentOutput)) {
			// Don't change state for prompt box only output
			// But keep the waitingForNonPromptOutput flag active if it was set
			return;
		}

		// If we have output after "esc to interrupt" that's not a prompt box, clear the trackers
		if (
			(wasEscToInterruptActive || waitingForNonPrompt) &&
			hasNewOutput &&
			!isPromptBox &&
			!hasEscToInterrupt
		) {
			this.escToInterruptTracker.set(session.id, false);
			this.waitingForNonPromptOutput.set(session.id, false);
		}

		// Check if waiting for input using actual Claude patterns
		const isWaiting = isWaitingForInput(cleanRecentOutput);
		const wasWaiting = this.waitingStateTracker.get(session.id) || false;

		// Check if the new output is just a prompt box bottom border
		const isJustBottomBorder = this.isPromptBoxBottomBorder(cleanRecentOutput);

		// Determine state based on patterns and activity
		let newState = oldState; // Start with current state

		if (isWaiting) {
			newState = 'waiting_input';
			this.waitingStateTracker.set(session.id, true);
			// Clear the waiting for non-prompt output flag when entering waiting state
			this.waitingForNonPromptOutput.set(session.id, false);
		} else if (wasWaiting && isJustBottomBorder) {
			// When Claude is waiting for input and user types, the prompt box bottom border
			// may appear as a separate chunk of output due to terminal rendering delays.
			// Without this check, the session would incorrectly transition from 'waiting_input'
			// to 'busy' state just because of this rendering artifact, causing UI flicker
			// and incorrect state representation. By maintaining the waiting state when we
			// detect this pattern, we ensure smooth state transitions.
			newState = 'waiting_input';
		} else if (hasNewOutput && !wasEscToInterruptActive) {
			// If we have new output that's not just a bottom border, session is active
			// But not if we had "esc to interrupt" previously
			newState = 'busy';
			this.waitingStateTracker.set(session.id, false);
		} else {
			// Check idle conditions
			// Idle if: not waiting AND (no "esc to interrupt" OR has output after "esc to interrupt" that's not prompt box)

			if (!isWaiting && !waitingForNonPrompt && timeSinceActivity > 3000) {
				// Normal idle after 3 seconds when not waiting for non-prompt output
				newState = 'idle';
				this.waitingStateTracker.set(session.id, false);
			} else if (
				!isWaiting &&
				(wasEscToInterruptActive || waitingForNonPrompt) &&
				hasNewOutput &&
				!isPromptBox &&
				!hasEscToInterrupt
			) {
				// Idle when we had "esc to interrupt" and then got non-prompt output
				newState = 'idle';
				this.waitingStateTracker.set(session.id, false);
			} else if (hasEscToInterrupt) {
				// If we just got "esc to interrupt", keep busy state
				newState = 'busy';
			}
			// else keep current state (including staying busy if waiting for non-prompt output)
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
