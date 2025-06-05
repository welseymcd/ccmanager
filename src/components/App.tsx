import React, {useState, useEffect} from 'react';
import {useApp} from 'ink';
import Menu from './Menu.js';
import Session from './Session.js';
import {SessionManager} from '../services/sessionManager.js';
import {Worktree, Session as SessionType} from '../types/index.js';

type View = 'menu' | 'session';

const App: React.FC = () => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');
	const [sessionManager] = useState(() => new SessionManager());
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);

	useEffect(() => {
		// Cleanup on unmount
		return () => {
			sessionManager.destroy();
		};
	}, [sessionManager]);

	const handleSelectWorktree = (worktree: Worktree) => {
		// Get or create session for this worktree
		let session = sessionManager.getSession(worktree.path);
		
		if (!session) {
			session = sessionManager.createSession(worktree.path);
		}

		setActiveSession(session);
		setView('session');
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);
		setView('menu');
		// Clear the screen when returning to menu
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}
	};

	const handleExit = () => {
		sessionManager.destroy();
		exit();
	};

	if (view === 'menu') {
		return (
			<Menu
				sessionManager={sessionManager}
				onSelectWorktree={handleSelectWorktree}
				onExit={handleExit}
			/>
		);
	}

	if (view === 'session' && activeSession) {
		return (
			<Session
				session={activeSession}
				onReturnToMenu={handleReturnToMenu}
			/>
		);
	}

	return null;
};

export default App;