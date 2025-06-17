import React, {useState, useEffect, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {WorktreeService} from '../services/worktreeService.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {Worktree} from '../types/index.js';

interface CodeModificationViewerProps {
	onComplete: () => void;
	onCancel: () => void;
}

interface FileChange {
	status: string;
	file: string;
	insertions?: number;
	deletions?: number;
}

interface DiffHunk {
	header: string;
	lines: Array<{
		type: 'context' | 'addition' | 'deletion';
		content: string;
		lineNumber?: {old?: number; new?: number};
	}>;
}

interface FileDiff {
	file: string;
	status: string;
	hunks: DiffHunk[];
}

const CodeModificationViewer: React.FC<CodeModificationViewerProps> = ({
	onComplete: _onComplete,
	onCancel,
}) => {
	const [worktreeService] = useState(() => new WorktreeService());
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	);
	const [view, setView] = useState<
		'worktree-select' | 'overview' | 'file-diff'
	>('worktree-select');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
	const [diffViewMode, setDiffViewMode] = useState<'staged' | 'unstaged'>(
		'unstaged',
	);
	const [scrollOffset, setScrollOffset] = useState(0);
	const [maxVisibleLines] = useState(20);

	useEffect(() => {
		const loadedWorktrees = worktreeService.getWorktrees();
		setWorktrees(loadedWorktrees);
	}, [worktreeService]);

	const loadFileChanges = useCallback(async (worktree: Worktree) => {
		setLoading(true);
		setError(null);
		try {
			const {execSync} = await import('child_process');

			// Get file status
			const statusOutput = execSync('git status --porcelain', {
				cwd: worktree.path,
				encoding: 'utf8',
			});

			const changes: FileChange[] = [];
			const lines = statusOutput
				.trim()
				.split('\n')
				.filter(line => line);

			for (const line of lines) {
				const status = line.substring(0, 2);
				const file = line.substring(3);

				// Get file stats if possible
				try {
					const diffStat = execSync(`git diff --numstat -- "${file}"`, {
						cwd: worktree.path,
						encoding: 'utf8',
					}).trim();

					if (diffStat) {
						const [insertions, deletions] = diffStat
							.split('\t')
							.map(n => parseInt(n, 10));
						changes.push({status, file, insertions, deletions});
					} else {
						changes.push({status, file});
					}
				} catch {
					changes.push({status, file});
				}
			}

			setFileChanges(changes);
			setView('overview');
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to load changes',
			);
		} finally {
			setLoading(false);
		}
	}, []);

	const loadFileDiff = useCallback(
		async (file: string) => {
			if (!selectedWorktree) return;

			setLoading(true);
			setError(null);
			try {
				const {execSync} = await import('child_process');

				const command =
					diffViewMode === 'staged'
						? `git diff --cached -- "${file}"`
						: `git diff -- "${file}"`;

				const diffOutput = execSync(command, {
					cwd: selectedWorktree.path,
					encoding: 'utf8',
				});

				const diff = parseDiff(diffOutput, file);
				setFileDiff(diff);
				setScrollOffset(0);
				setView('file-diff');
			} catch (error) {
				setError(
					error instanceof Error ? error.message : 'Failed to load diff',
				);
			} finally {
				setLoading(false);
			}
		},
		[selectedWorktree, diffViewMode],
	);

	const parseDiff = (diffOutput: string, fileName: string): FileDiff => {
		const lines = diffOutput.split('\n');
		const hunks: DiffHunk[] = [];
		let currentHunk: DiffHunk | null = null;
		let oldLineNum = 0;
		let newLineNum = 0;

		for (const line of lines) {
			if (line.startsWith('@@')) {
				// New hunk
				if (currentHunk) {
					hunks.push(currentHunk);
				}

				const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
				if (match) {
					oldLineNum = parseInt(match[1] || '0', 10);
					newLineNum = parseInt(match[2] || '0', 10);
				}

				currentHunk = {
					header: line,
					lines: [],
				};
			} else if (currentHunk) {
				if (line.startsWith('+')) {
					currentHunk.lines.push({
						type: 'addition',
						content: line.substring(1),
						lineNumber: {new: newLineNum++},
					});
				} else if (line.startsWith('-')) {
					currentHunk.lines.push({
						type: 'deletion',
						content: line.substring(1),
						lineNumber: {old: oldLineNum++},
					});
				} else if (line.startsWith(' ')) {
					currentHunk.lines.push({
						type: 'context',
						content: line.substring(1),
						lineNumber: {old: oldLineNum++, new: newLineNum++},
					});
				}
			}
		}

		if (currentHunk) {
			hunks.push(currentHunk);
		}

		return {
			file: fileName,
			status: 'modified',
			hunks,
		};
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			if (view === 'file-diff') {
				setView('overview');
			} else if (view === 'overview') {
				setView('worktree-select');
			} else {
				onCancel();
			}
		} else if (view === 'file-diff' && fileDiff) {
			const totalLines = fileDiff.hunks.reduce(
				(sum, hunk) => sum + hunk.lines.length + 1,
				0,
			);

			if (key.upArrow || input === 'k') {
				setScrollOffset(Math.max(0, scrollOffset - 1));
			} else if (key.downArrow || input === 'j') {
				setScrollOffset(
					Math.max(0, Math.min(scrollOffset + 1, totalLines - maxVisibleLines)),
				);
			} else if (key.pageUp) {
				setScrollOffset(Math.max(0, scrollOffset - maxVisibleLines));
			} else if (key.pageDown) {
				setScrollOffset(
					Math.max(
						0,
						Math.min(
							scrollOffset + maxVisibleLines,
							totalLines - maxVisibleLines,
						),
					),
				);
			} else if (input === 's') {
				setDiffViewMode(diffViewMode === 'staged' ? 'unstaged' : 'staged');
				loadFileDiff(selectedFile!);
			}
		}
	});

	const handleSelectWorktree = (item: {label: string; value: string}) => {
		if (item.value === 'cancel') {
			onCancel();
			return;
		}

		const worktree = worktrees.find(wt => wt.path === item.value);
		if (worktree) {
			setSelectedWorktree(worktree);
			loadFileChanges(worktree);
		}
	};

	const handleSelectFile = (item: {label: string; value: string}) => {
		if (item.value === 'back') {
			setView('worktree-select');
			return;
		}
		if (item.value === 'cancel') {
			onCancel();
			return;
		}

		setSelectedFile(item.value);
		loadFileDiff(item.value);
	};

	const getStatusSymbol = (status: string): {symbol: string; color: string} => {
		const firstChar = status[0];
		const secondChar = status[1];

		if (firstChar === 'M' || secondChar === 'M')
			return {symbol: 'M', color: 'yellow'};
		if (firstChar === 'A' || secondChar === 'A')
			return {symbol: 'A', color: 'green'};
		if (firstChar === 'D' || secondChar === 'D')
			return {symbol: 'D', color: 'red'};
		if (firstChar === 'R' || secondChar === 'R')
			return {symbol: 'R', color: 'blue'};
		if (firstChar === '?' && secondChar === '?')
			return {symbol: '?', color: 'gray'};
		return {symbol: status.trim(), color: 'white'};
	};

	if (loading) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Loading...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {error}</Text>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to go back
					</Text>
				</Box>
			</Box>
		);
	}

	if (view === 'worktree-select') {
		const items = worktrees.map(wt => ({
			label: `${wt.branch.replace('refs/heads/', '')}${wt.isMainWorktree ? ' (main)' : ''}`,
			value: wt.path,
		}));
		items.push({label: '✗ Cancel', value: 'cancel'});

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					Code Modification Viewer
				</Text>
				<Box marginTop={1} marginBottom={1}>
					<Text>Select a worktree to view modifications:</Text>
				</Box>
				<SelectInput items={items} onSelect={handleSelectWorktree} />
			</Box>
		);
	}

	if (view === 'overview' && selectedWorktree) {
		const branchName = selectedWorktree.branch.replace('refs/heads/', '');

		if (fileChanges.length === 0) {
			return (
				<Box flexDirection="column">
					<Text bold color="cyan">
						Modifications in {branchName}
					</Text>
					<Box marginTop={1}>
						<Text color="green">✓ Working tree is clean</Text>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>
							Press {shortcutManager.getShortcutDisplay('cancel')} to go back
						</Text>
					</Box>
				</Box>
			);
		}

		const items = fileChanges.map(change => {
			const {symbol} = getStatusSymbol(change.status);
			const stats =
				change.insertions !== undefined && change.deletions !== undefined
					? ` (+${change.insertions}/-${change.deletions})`
					: '';
			return {
				label: `[${symbol}] ${change.file}${stats}`,
				value: change.file,
			};
		});
		items.push({label: '← Back', value: 'back'});
		items.push({label: '✗ Cancel', value: 'cancel'});

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					Modifications in {branchName}
				</Text>
				<Box marginTop={1} marginBottom={1}>
					<Text>
						{fileChanges.length} file{fileChanges.length !== 1 ? 's' : ''}{' '}
						changed
					</Text>
				</Box>
				<SelectInput items={items} onSelect={handleSelectFile} />
			</Box>
		);
	}

	if (view === 'file-diff' && fileDiff && selectedWorktree) {
		const branchName = selectedWorktree.branch.replace('refs/heads/', '');
		const allLines: Array<{type: string; content: string; color?: string}> = [];

		fileDiff.hunks.forEach(hunk => {
			allLines.push({type: 'header', content: hunk.header, color: 'cyan'});
			hunk.lines.forEach(line => {
				let color = 'white';
				let prefix = ' ';
				if (line.type === 'addition') {
					color = 'green';
					prefix = '+';
				} else if (line.type === 'deletion') {
					color = 'red';
					prefix = '-';
				}
				allLines.push({
					type: line.type,
					content: prefix + line.content,
					color,
				});
			});
		});

		const visibleLines = allLines.slice(
			scrollOffset,
			scrollOffset + maxVisibleLines,
		);
		const hasMore = allLines.length > scrollOffset + maxVisibleLines;
		const hasLess = scrollOffset > 0;

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					{fileDiff.file} - {branchName} ({diffViewMode} changes)
				</Text>
				<Box marginTop={1} marginBottom={1} flexDirection="column">
					{hasLess && <Text dimColor>↑ More above...</Text>}
					{visibleLines.map((line, index) => (
						<Text key={index} color={line.color}>
							{line.content}
						</Text>
					))}
					{hasMore && <Text dimColor>↓ More below...</Text>}
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						↑↓/jk: Scroll | s: Toggle staged/unstaged |{' '}
						{shortcutManager.getShortcutDisplay('cancel')}: Back
					</Text>
				</Box>
			</Box>
		);
	}

	return null;
};

export default CodeModificationViewer;
