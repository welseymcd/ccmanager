import React, {useState, useEffect} from 'react';
import {useApp, Box, Text} from 'ink';
import Menu from './Menu.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import EditWorktree from './EditWorktree.js';
import ConfigureShortcuts from './ConfigureShortcuts.js';
import CodeModificationViewer from './CodeModificationViewer.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {Worktree, Session as SessionType} from '../types/index.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {database} from '../services/database.js';

type View =
	| 'menu'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'merging-worktree'
	| 'edit-worktree'
	| 'view-modifications'
	| 'configure-shortcuts';

const App: React.FC = () => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');
	const [sessionManager] = useState(() => new SessionManager());
	const [worktreeService] = useState(() => new WorktreeService());
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh

	// Set up graceful shutdown
	useEffect(() => {
		const handleExit = () => {
			// Save all sessions before exit
			sessionManager.destroy();
			// Close database connection
			database.close();
		};

		// Handle various exit signals
		process.on('exit', handleExit);
		process.on('SIGINT', handleExit);
		process.on('SIGTERM', handleExit);
		process.on('SIGHUP', handleExit);

		return () => {
			process.removeListener('exit', handleExit);
			process.removeListener('SIGINT', handleExit);
			process.removeListener('SIGTERM', handleExit);
			process.removeListener('SIGHUP', handleExit);
		};
	}, [sessionManager]);

	useEffect(() => {
		// Listen for session exits to return to menu automatically
		const handleSessionExit = (session: SessionType) => {
			// If the exited session is the active one, return to menu
			setActiveSession(current => {
				if (current && session.id === current.id) {
					// Session that exited is the active one, trigger return to menu
					setTimeout(() => {
						setActiveSession(null);
						setError(null);
						setView('menu');
						setMenuKey(prev => prev + 1);
						if (process.stdout.isTTY) {
							process.stdout.write('\x1B[2J\x1B[H');
						}
						process.stdin.resume();
						process.stdin.setEncoding('utf8');
					}, 0);
				}
				return current;
			});
		};

		sessionManager.on('sessionExit', handleSessionExit);

		// Cleanup on unmount
		return () => {
			sessionManager.off('sessionExit', handleSessionExit);
			sessionManager.destroy();
		};
	}, [sessionManager]);

	const handleSelectWorktree = (worktree: Worktree) => {
		// Check if this is the new worktree option
		if (worktree.path === '') {
			setView('new-worktree');
			return;
		}

		// Check if this is the delete worktree option
		if (worktree.path === 'DELETE_WORKTREE') {
			setView('delete-worktree');
			return;
		}

		// Check if this is the merge worktree option
		if (worktree.path === 'MERGE_WORKTREE') {
			setView('merge-worktree');
			return;
		}

		// Check if this is the edit worktree option
		if (worktree.path === 'EDIT_WORKTREE') {
			setView('edit-worktree');
			return;
		}

		// Check if this is the view modifications option
		if (worktree.path === 'VIEW_MODIFICATIONS') {
			setView('view-modifications');
			return;
		}

		// Check if this is the configure shortcuts option
		if (worktree.path === 'CONFIGURE_SHORTCUTS') {
			setView('configure-shortcuts');
			return;
		}

		// Check if this is the exit application option
		if (worktree.path === 'EXIT_APPLICATION') {
			sessionManager.destroy();
			exit();
			return;
		}

		// Create or get session for this worktree
		// createSession will return existing session or create a new one
		// and ensure the process exists for restored sessions
		const session = sessionManager.createSession(worktree.path);

		setActiveSession(session);
		setView('session');
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);
		setError(null);

		// Add a small delay to ensure Session cleanup completes
		setTimeout(() => {
			setView('menu');
			setMenuKey(prev => prev + 1); // Force menu refresh

			// Clear the screen when returning to menu
			if (process.stdout.isTTY) {
				process.stdout.write('\x1B[2J\x1B[H');
			}

			// Ensure stdin is in a clean state for Ink components
			if (process.stdin.isTTY) {
				// Flush any pending input to prevent escape sequences from leaking
				process.stdin.read();
				process.stdin.setRawMode(false);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
			}
		}, 50); // Small delay to ensure proper cleanup
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

	const handleDeleteWorktrees = async (worktreePaths: string[]) => {
		setView('deleting-worktree');
		setError(null);

		// Delete the worktrees
		let hasError = false;
		for (const path of worktreePaths) {
			const result = worktreeService.deleteWorktree(path);
			if (!result.success) {
				hasError = true;
				setError(result.error || 'Failed to delete worktree');
				break;
			}
		}

		if (!hasError) {
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setView('delete-worktree');
		}
	};

	const handleCancelDeleteWorktree = () => {
		handleReturnToMenu();
	};

	const handleMergeWorktree = async (
		sourceBranch: string,
		targetBranch: string,
		deleteAfterMerge: boolean,
		useRebase: boolean,
	) => {
		setView('merging-worktree');
		setError(null);

		// Perform the merge
		const mergeResult = worktreeService.mergeWorktree(
			sourceBranch,
			targetBranch,
			useRebase,
		);

		if (mergeResult.success) {
			// If user wants to delete the merged branch
			if (deleteAfterMerge) {
				const deleteResult =
					worktreeService.deleteWorktreeByBranch(sourceBranch);
				if (!deleteResult.success) {
					setError(deleteResult.error || 'Failed to delete merged worktree');
					setView('merge-worktree');
					return;
				}
			}
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setError(mergeResult.error || 'Failed to merge branches');
			setView('merge-worktree');
		}
	};

	const handleCancelMergeWorktree = () => {
		handleReturnToMenu();
	};

	if (view === 'menu') {
		return (
			<Menu
				key={menuKey}
				sessionManager={sessionManager}
				onSelectWorktree={handleSelectWorktree}
			/>
		);
	}

	if (view === 'session' && activeSession) {
		return (
			<Box flexDirection="column">
				<Session
					key={activeSession.id}
					session={activeSession}
					sessionManager={sessionManager}
					onReturnToMenu={handleReturnToMenu}
				/>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('returnToMenu')} to return
						to menu
					</Text>
				</Box>
			</Box>
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

	if (view === 'delete-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<DeleteWorktree
					onComplete={handleDeleteWorktrees}
					onCancel={handleCancelDeleteWorktree}
				/>
			</Box>
		);
	}

	if (view === 'deleting-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="red">Deleting worktrees...</Text>
			</Box>
		);
	}

	if (view === 'merge-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<MergeWorktree
					onComplete={handleMergeWorktree}
					onCancel={handleCancelMergeWorktree}
				/>
			</Box>
		);
	}

	if (view === 'merging-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="green">Merging worktrees...</Text>
			</Box>
		);
	}

	if (view === 'configure-shortcuts') {
		return <ConfigureShortcuts onComplete={handleReturnToMenu} />;
	}

	if (view === 'edit-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<EditWorktree
					onComplete={handleReturnToMenu}
					onCancel={handleReturnToMenu}
				/>
			</Box>
		);
	}

	if (view === 'view-modifications') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<CodeModificationViewer
					onComplete={handleReturnToMenu}
					onCancel={handleReturnToMenu}
				/>
			</Box>
		);
	}

	return null;
};

export default App;
