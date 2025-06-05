import React, {useState, useEffect} from 'react';
import {useApp, Box, Text} from 'ink';
import Menu from './Menu.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {Worktree, Session as SessionType} from '../types/index.js';

type View = 'menu' | 'session' | 'new-worktree' | 'creating-worktree';

const App: React.FC = () => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');
	const [sessionManager] = useState(() => new SessionManager());
	const [worktreeService] = useState(() => new WorktreeService());
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh

	useEffect(() => {
		// Cleanup on unmount
		return () => {
			sessionManager.destroy();
		};
	}, [sessionManager]);

	const handleSelectWorktree = (worktree: Worktree) => {
		// Check if this is the new worktree option
		if (worktree.path === '') {
			setView('new-worktree');
			return;
		}

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
		setError(null);
		setView('menu');
		setMenuKey(prev => prev + 1); // Force menu refresh
		// Clear the screen when returning to menu
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}
	};

	const handleCreateWorktree = async (path: string, branch: string) => {
		setView('creating-worktree');
		setError(null);

		// Create the worktree
		const result = worktreeService.createWorktree(path, branch);

		if (result.success) {
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setError(result.error || 'Failed to create worktree');
			setView('new-worktree');
		}
	};

	const handleCancelNewWorktree = () => {
		handleReturnToMenu();
	};

	const handleExit = () => {
		sessionManager.destroy();
		exit();
	};

	if (view === 'menu') {
		return (
			<Menu
				key={menuKey}
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
				sessionManager={sessionManager}
				onReturnToMenu={handleReturnToMenu}
			/>
		);
	}

	if (view === 'new-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<NewWorktree
					onComplete={handleCreateWorktree}
					onCancel={handleCancelNewWorktree}
				/>
			</Box>
		);
	}

	if (view === 'creating-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="green">Creating worktree...</Text>
			</Box>
		);
	}

	return null;
};

export default App;