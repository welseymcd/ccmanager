import React, {useEffect, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';

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

	useEffect(() => {
		if (!stdout) return;

		// Clear screen when entering session
		stdout.write('\x1B[2J\x1B[H');

		// Handle session restoration
		const handleSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id === session.id) {
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
		sessionManager.setSessionActive(session.worktreePath, true);

		// Listen for session data events
		const handleSessionData = (activeSession: SessionType, data: string) => {
			// Only handle data for our session
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (exitedSession.id === session.id) {
				setIsExiting(true);
				// Don't call onReturnToMenu here - App component handles it
			}
		};

		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Handle terminal resize
		const handleResize = () => {
			session.process.resize(
				process.stdout.columns || 80,
				process.stdout.rows || 24,
			);
		};

		stdout.on('resize', handleResize);

		// Set up raw input handling
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const handleStdinData = (data: string) => {
			if (isExiting) return;

			// Check for Ctrl+E (ASCII code 5)
			if (data === '\x05') {
				stdin.setRawMode(false);
				stdin.pause();
				onReturnToMenu();
				return;
			}

			// Pass all other input directly to the PTY
			session.process.write(data);
		};

		stdin.on('data', handleStdinData);

		return () => {
			// Restore stdin
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener('data', handleStdinData);

			// Mark session as inactive
			sessionManager.setSessionActive(session.worktreePath, false);

			// Remove event listeners
			sessionManager.off('sessionRestore', handleSessionRestore);
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [session, sessionManager, stdout, onReturnToMenu, isExiting]);

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;
