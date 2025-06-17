import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import {WorktreeService} from '../services/worktreeService.js';
import {Worktree} from '../types/index.js';

interface EditWorktreeProps {
	onComplete: () => void;
	onCancel: () => void;
}

const EditWorktree: React.FC<EditWorktreeProps> = ({onComplete, onCancel}) => {
	const [worktreeService] = useState(() => new WorktreeService());
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	);
	const [action, setAction] = useState<'select' | 'action'>('select');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		const loadedWorktrees = worktreeService.getWorktrees();
		// Filter out main worktree as it typically shouldn't be edited
		const editableWorktrees = loadedWorktrees.filter(wt => !wt.isMainWorktree);
		setWorktrees(editableWorktrees);
	}, [worktreeService]);

	const handleSelectWorktree = (item: {label: string; value: string}) => {
		if (item.value === 'cancel') {
			onCancel();
			return;
		}

		const worktree = worktrees.find(wt => wt.path === item.value);
		if (worktree) {
			setSelectedWorktree(worktree);
			setAction('action');
		}
	};

	const handleSelectAction = async (item: {label: string; value: string}) => {
		if (item.value === 'back') {
			setAction('select');
			setError(null);
			setSuccess(null);
			return;
		}

		if (item.value === 'cancel') {
			onCancel();
			return;
		}

		if (!selectedWorktree) return;

		setLoading(true);
		setError(null);
		setSuccess(null);

		try {
			const {execSync} = await import('child_process');

			switch (item.value) {
				case 'pull':
					execSync('git pull', {
						cwd: selectedWorktree.path,
						encoding: 'utf8',
					});
					setSuccess('Successfully pulled latest changes');
					setTimeout(() => onComplete(), 1500);
					break;

				case 'fetch':
					execSync('git fetch', {
						cwd: selectedWorktree.path,
						encoding: 'utf8',
					});
					setSuccess('Successfully fetched remote changes');
					setTimeout(() => onComplete(), 1500);
					break;

				case 'status': {
					const statusOutput = execSync('git status --short', {
						cwd: selectedWorktree.path,
						encoding: 'utf8',
					});
					if (statusOutput.trim()) {
						setSuccess(`Status:\n${statusOutput}`);
					} else {
						setSuccess('Working tree is clean');
					}
					break;
				}

				case 'clean':
					execSync('git clean -fd', {
						cwd: selectedWorktree.path,
						encoding: 'utf8',
					});
					setSuccess('Successfully cleaned untracked files');
					setTimeout(() => onComplete(), 1500);
					break;
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Operation failed');
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Processing...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {error}</Text>
				<Box marginTop={1}>
					<SelectInput
						items={[
							{label: '← Back', value: 'back'},
							{label: '✗ Cancel', value: 'cancel'},
						]}
						onSelect={handleSelectAction}
					/>
				</Box>
			</Box>
		);
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">{success}</Text>
			</Box>
		);
	}

	if (action === 'select') {
		const items = worktrees.map(wt => ({
			label: wt.branch.replace('refs/heads/', ''),
			value: wt.path,
		}));

		items.push({label: '✗ Cancel', value: 'cancel'});

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					Edit Worktree
				</Text>
				<Box marginTop={1} marginBottom={1}>
					<Text>Select a worktree to edit:</Text>
				</Box>
				<SelectInput items={items} onSelect={handleSelectWorktree} />
			</Box>
		);
	}

	if (action === 'action' && selectedWorktree) {
		const branchName = selectedWorktree.branch.replace('refs/heads/', '');
		const actionItems = [
			{label: '↓ Pull latest changes', value: 'pull'},
			{label: '⟳ Fetch remote changes', value: 'fetch'},
			{label: '📊 Show status', value: 'status'},
			{label: '🧹 Clean untracked files', value: 'clean'},
			{label: '← Back', value: 'back'},
			{label: '✗ Cancel', value: 'cancel'},
		];

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					Edit Worktree: {branchName}
				</Text>
				<Box marginTop={1} marginBottom={1}>
					<Text>Select an action:</Text>
				</Box>
				<SelectInput items={actionItems} onSelect={handleSelectAction} />
			</Box>
		);
	}

	return null;
};

export default EditWorktree;
