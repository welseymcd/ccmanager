import React, {useEffect, useState} from 'react';
import {useInput, useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';

interface SessionProps {
	session: SessionType;
	sessionManager: SessionManager;
	onReturnToMenu: () => void;
}

const Session: React.FC<SessionProps> = ({session, sessionManager, onReturnToMenu}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		if (!stdout) return;

		// Clear screen when entering session
		stdout.write('\x1B[2J\x1B[H');

		// Mark session as active
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
				onReturnToMenu();
			}
		};

		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Handle terminal resize
		const handleResize = () => {
			session.process.resize(
				process.stdout.columns || 80,
				process.stdout.rows || 24
			);
		};
		
		stdout.on('resize', handleResize);

		return () => {
			// Mark session as inactive
			sessionManager.setSessionActive(session.worktreePath, false);
			
			// Remove event listeners
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [session, sessionManager, stdout, onReturnToMenu, isExiting]);

	useInput((char, key) => {
		if (isExiting) return;

		if (key.ctrl && char === 'e') {
			onReturnToMenu();
			return;
		}

		// Pass all other input to the PTY
		if (key.ctrl && char === 'c') {
			session.process.write('\x03');
		} else if (key.ctrl && char === 'd') {
			session.process.write('\x04');
		} else if (key.ctrl && char === 'a') {
			session.process.write('\x01');
		} else if (key.ctrl && char === 'k') {
			session.process.write('\x0B');
		} else if (key.ctrl && char === 'l') {
			session.process.write('\x0C');
		} else if (key.ctrl && char === 'u') {
			session.process.write('\x15');
		} else if (key.ctrl && char === 'w') {
			session.process.write('\x17');
		} else if (key.return) {
			session.process.write('\r');
		} else if (key.backspace || key.delete) {
			session.process.write('\x7F');
		} else if (key.tab) {
			session.process.write('\t');
		} else if (key.escape) {
			session.process.write('\x1B');
		} else if (key.upArrow) {
			session.process.write('\x1B[A');
		} else if (key.downArrow) {
			session.process.write('\x1B[B');
		} else if (key.leftArrow) {
			session.process.write('\x1B[D');
		} else if (key.rightArrow) {
			session.process.write('\x1B[C');
		} else if (char) {
			session.process.write(char);
		}
	});

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;