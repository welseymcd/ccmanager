import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Worktree, Session} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import {SessionManager} from '../services/sessionManager.js';

interface MenuProps {
	sessionManager: SessionManager;
	onSelectWorktree: (worktree: Worktree) => void;
	onExit: () => void;
}

interface MenuItem {
	label: string;
	value: string;
	worktree?: Worktree;
}

const Menu: React.FC<MenuProps> = ({
	sessionManager,
	onSelectWorktree,
	onExit,
}) => {
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);

	useEffect(() => {
		// Load worktrees
		const worktreeService = new WorktreeService();
		const loadedWorktrees = worktreeService.getWorktrees();
		setWorktrees(loadedWorktrees);

		// Update sessions
		const updateSessions = () => {
			const allSessions = sessionManager.getAllSessions();
			setSessions(allSessions);

			// Update worktree session status
			loadedWorktrees.forEach(wt => {
				wt.hasSession = allSessions.some(s => s.worktreePath === wt.path);
			});
		};

		updateSessions();

		// Listen for session changes
		const handleSessionChange = () => updateSessions();
		sessionManager.on('sessionCreated', handleSessionChange);
		sessionManager.on('sessionDestroyed', handleSessionChange);
		sessionManager.on('sessionStateChanged', handleSessionChange);

		return () => {
			sessionManager.off('sessionCreated', handleSessionChange);
			sessionManager.off('sessionDestroyed', handleSessionChange);
			sessionManager.off('sessionStateChanged', handleSessionChange);
		};
	}, [sessionManager]);

	useEffect(() => {
		// Build menu items
		const menuItems: MenuItem[] = worktrees.map(wt => {
			const session = sessions.find(s => s.worktreePath === wt.path);
			let status = '';

			if (session) {
				switch (session.state) {
					case 'busy':
						status = ' [🔴 Active]';
						break;
					case 'waiting_input':
						status = ' [🟠 Waiting]';
						break;
					case 'idle':
						status = ' [🔵 Idle]';
						break;
				}
			}

			const branchName = wt.branch.replace('refs/heads/', '');
			const isMain = wt.isMainWorktree ? ' (main)' : '';

			return {
				label: `${branchName}${isMain}${status}`,
				value: wt.path,
				worktree: wt,
			};
		});

		// Add menu options
		menuItems.push({
			label: '─────────────',
			value: 'separator',
		});
		menuItems.push({
			label: 'New Worktree',
			value: 'new-worktree',
		});
		menuItems.push({
			label: 'Exit',
			value: 'exit',
		});

		setItems(menuItems);
	}, [worktrees, sessions]);

	useInput((input, key) => {
		if (key.ctrl && input === 'q') {
			onExit();
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value === 'exit') {
			onExit();
		} else if (item.value === 'separator') {
			// Do nothing for separator
		} else if (item.value === 'new-worktree') {
			// Handle in parent component
			onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.worktree) {
			onSelectWorktree(item.worktree);
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					CCManager - Claude Code Worktree Manager
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Select a worktree to start or resume a Claude Code session:
				</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} isFocused={true} />

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Status: 🔴 Active 🟠 Waiting 🔵 Idle</Text>
				<Text dimColor>Controls: ↑↓ Navigate Enter Select Ctrl+Q Exit</Text>
			</Box>
		</Box>
	);
};

export default Menu;
