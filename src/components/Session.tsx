import React, {useEffect, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface SessionProps {
	session: SessionType;
	sessionManager: SessionManager;
	onReturnToMenu: () => void;
}

const Session: React.FC<SessionProps> = ({
	session,
	sessionManager,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);
	const [currentSession, setCurrentSession] = useState(session);

	useEffect(() => {
		if (!stdout) return;

		// Wait for process to be available
		if (!currentSession.process) {
			console.log(
				'[Session] Waiting for process to be created for session:',
				currentSession.id,
			);
			// For restored sessions, the process will be created shortly
			return;
		}

		// Check if this is a restored session with output history
		const hasRestoredOutput =
			currentSession.isRestored && currentSession.outputHistory.length > 0;

		console.log('[Session] Setting up session:', {
			id: currentSession.id,
			isRestored: currentSession.isRestored,
			outputHistoryLength: currentSession.outputHistory.length,
			hasProcess: !!currentSession.process,
		});

		// Only clear screen for new sessions without restored output
		if (!hasRestoredOutput) {
			stdout.write('\x1B[2J\x1B[H');
		}

		// Handle session restoration
		const handleSessionRestore = (restoredSession: SessionType) => {
			console.log(
				'[Session] handleSessionRestore called for:',
				restoredSession.id,
				'current session:',
				currentSession.id,
			);
			if (restoredSession.id === currentSession.id) {
				console.log(
					'[Session] Restoring output, buffer count:',
					restoredSession.outputHistory.length,
				);
				// Clear screen before restoring output
				stdout.write('\x1B[2J\x1B[H');

				// Replay all buffered output, but skip the initial clear if present
				for (let i = 0; i < restoredSession.outputHistory.length; i++) {
					const buffer = restoredSession.outputHistory[i];
					if (!buffer) continue;

					const str = buffer.toString('utf8');

					// Skip clear screen sequences at the beginning
					if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
						// Skip this buffer or remove the clear sequence
						const cleaned = str
							.replace(/\x1B\[2J/g, '')
							.replace(/\x1B\[H/g, '');
						if (cleaned.length > 0) {
							stdout.write(Buffer.from(cleaned, 'utf8'));
						}
					} else {
						stdout.write(buffer);
					}
				}
			}
		};

		// Listen for restore event first
		sessionManager.on('sessionRestore', handleSessionRestore);

		// Mark session as active (this will trigger the restore event)
		console.log(
			'[Session] Setting session active for:',
			currentSession.worktreePath,
		);
		sessionManager.setSessionActive(currentSession.worktreePath, true);

		// Listen for session data events
		const handleSessionData = (activeSession: SessionType, data: string) => {
			// Only handle data for our session (check both original and current)
			if (
				(activeSession.id === session.id ||
					activeSession.id === currentSession.id) &&
				!isExiting
			) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (
				exitedSession.id === session.id ||
				exitedSession.id === currentSession.id
			) {
				setIsExiting(true);
				// Don't call onReturnToMenu here - App component handles it
			}
		};

		// Handle when a restored session gets its process created
		const handleSessionCreated = (createdSession: SessionType) => {
			if (
				createdSession.id === session.id ||
				createdSession.worktreePath === session.worktreePath
			) {
				console.log('[Session] Session process created, updating state');
				// Update our state with the session that has a process
				setCurrentSession(createdSession);
			}
		};

		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);
		sessionManager.on('sessionCreated', handleSessionCreated);

		// Handle terminal resize
		const handleResize = () => {
			if (currentSession.process) {
				currentSession.process.resize(
					process.stdout.columns || 80,
					process.stdout.rows || 24,
				);
			}
		};

		stdout.on('resize', handleResize);

		// Set up raw input handling
		const stdin = process.stdin;

		// Store original stdin state
		const originalIsRaw = stdin.isRaw;
		const originalIsPaused = stdin.isPaused();

		// Configure stdin for PTY passthrough
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const handleStdinData = (data: string) => {
			if (isExiting) return;

			// Check for return to menu shortcut
			const returnToMenuShortcut = shortcutManager.getShortcuts().returnToMenu;
			const shortcutCode =
				shortcutManager.getShortcutCode(returnToMenuShortcut);

			if (shortcutCode && data === shortcutCode) {
				// Disable focus reporting mode before returning to menu
				if (stdout) {
					stdout.write('\x1b[?1004l');
				}
				// Restore stdin state before returning to menu
				stdin.removeListener('data', handleStdinData);
				stdin.setRawMode(false);
				stdin.pause();
				onReturnToMenu();
				return;
			}

			// Pass all other input directly to the PTY
			if (currentSession.process) {
				currentSession.process.write(data);
			}
		};

		stdin.on('data', handleStdinData);

		return () => {
			// Remove listener first to prevent any race conditions
			stdin.removeListener('data', handleStdinData);

			// Disable focus reporting mode that might have been enabled by the PTY
			if (stdout) {
				stdout.write('\x1b[?1004l');
			}

			// Restore stdin to its original state
			if (stdin.isTTY) {
				stdin.setRawMode(originalIsRaw || false);
				if (originalIsPaused) {
					stdin.pause();
				} else {
					stdin.resume();
				}
			}

			// Mark session as inactive
			sessionManager.setSessionActive(session.worktreePath, false);

			// Remove event listeners
			sessionManager.off('sessionRestore', handleSessionRestore);
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			sessionManager.off('sessionCreated', handleSessionCreated);
			stdout.off('resize', handleResize);
		};
	}, [
		session,
		currentSession,
		sessionManager,
		stdout,
		onReturnToMenu,
		isExiting,
	]);

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;
