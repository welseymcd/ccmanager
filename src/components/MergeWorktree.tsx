import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {WorktreeService} from '../services/worktreeService.js';

interface MergeWorktreeProps {
	onComplete: (
		sourceBranch: string,
		targetBranch: string,
		deleteAfterMerge: boolean,
		useRebase: boolean,
	) => void;
	onCancel: () => void;
}

type Step =
	| 'select-source'
	| 'select-target'
	| 'select-operation'
	| 'confirm-merge'
	| 'delete-confirm';

interface BranchItem {
	label: string;
	value: string;
}

const MergeWorktree: React.FC<MergeWorktreeProps> = ({
	onComplete,
	onCancel,
}) => {
	const [step, setStep] = useState<Step>('select-source');
	const [sourceBranch, setSourceBranch] = useState<string>('');
	const [targetBranch, setTargetBranch] = useState<string>('');
	const [branchItems, setBranchItems] = useState<BranchItem[]>([]);
	const [confirmFocused, setConfirmFocused] = useState(true);
	const [deleteFocused, setDeleteFocused] = useState(true);
	const [useRebase, setUseRebase] = useState(false);
	const [operationFocused, setOperationFocused] = useState(false);

	useEffect(() => {
		const worktreeService = new WorktreeService();
		const loadedWorktrees = worktreeService.getWorktrees();

		// Create branch items for selection
		const items = loadedWorktrees.map(wt => ({
			label:
				wt.branch.replace('refs/heads/', '') +
				(wt.isMainWorktree ? ' (main)' : ''),
			value: wt.branch.replace('refs/heads/', ''),
		}));
		setBranchItems(items);
	}, []);

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		if (step === 'select-operation') {
			if (key.leftArrow || key.rightArrow) {
				const newOperationFocused = !operationFocused;
				setOperationFocused(newOperationFocused);
				setUseRebase(newOperationFocused);
			} else if (key.return) {
				setStep('confirm-merge');
			}
		} else if (step === 'confirm-merge') {
			if (key.leftArrow || key.rightArrow) {
				setConfirmFocused(!confirmFocused);
			} else if (key.return) {
				if (confirmFocused) {
					// Proceed with merge
					setStep('delete-confirm');
				} else {
					// Cancel
					onCancel();
				}
			}
		} else if (step === 'delete-confirm') {
			if (key.leftArrow || key.rightArrow) {
				setDeleteFocused(!deleteFocused);
			} else if (key.return) {
				// Complete the merge with delete preference
				onComplete(sourceBranch, targetBranch, deleteFocused, useRebase);
			}
		}
	});

	const handleSelectSource = (item: BranchItem) => {
		setSourceBranch(item.value);
		// Filter out the selected source branch for target selection
		const filteredItems = branchItems.filter(b => b.value !== item.value);
		setBranchItems(filteredItems);
		setStep('select-target');
	};

	const handleSelectTarget = (item: BranchItem) => {
		setTargetBranch(item.value);
		setStep('select-operation');
	};

	if (step === 'select-source') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Merge Worktree
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select the source branch to merge:</Text>
				</Box>

				<SelectInput
					items={branchItems}
					onSelect={handleSelectSource}
					isFocused={true}
				/>

				<Box marginTop={1}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'select-target') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Merge Worktree
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Merging from: <Text color="yellow">{sourceBranch}</Text>
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select the target branch to merge into:</Text>
				</Box>

				<SelectInput
					items={branchItems}
					onSelect={handleSelectTarget}
					isFocused={true}
				/>

				<Box marginTop={1}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'select-operation') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select Operation
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Choose how to integrate <Text color="yellow">{sourceBranch}</Text>{' '}
						into <Text color="yellow">{targetBranch}</Text>:
					</Text>
				</Box>

				<Box>
					<Box marginRight={2}>
						<Text
							color={!operationFocused ? 'green' : 'white'}
							inverse={!operationFocused}
						>
							{' '}
							Merge{' '}
						</Text>
					</Box>
					<Box>
						<Text
							color={operationFocused ? 'blue' : 'white'}
							inverse={operationFocused}
						>
							{' '}
							Rebase{' '}
						</Text>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Use ← → to navigate, Enter to select, ESC to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'confirm-merge') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Confirm {useRebase ? 'Rebase' : 'Merge'}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						{useRebase ? 'Rebase' : 'Merge'}{' '}
						<Text color="yellow">{sourceBranch}</Text>{' '}
						{useRebase ? 'onto' : 'into'}{' '}
						<Text color="yellow">{targetBranch}</Text>?
					</Text>
				</Box>

				<Box>
					<Box marginRight={2}>
						<Text
							color={confirmFocused ? 'green' : 'white'}
							inverse={confirmFocused}
						>
							{' '}
							Yes{' '}
						</Text>
					</Box>
					<Box>
						<Text
							color={!confirmFocused ? 'red' : 'white'}
							inverse={!confirmFocused}
						>
							{' '}
							No{' '}
						</Text>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Use ← → to navigate, Enter to select, ESC to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'delete-confirm') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Delete Source Branch?
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Delete the merged branch <Text color="yellow">{sourceBranch}</Text>{' '}
						and its worktree?
					</Text>
				</Box>

				<Box>
					<Box marginRight={2}>
						<Text
							color={deleteFocused ? 'green' : 'white'}
							inverse={deleteFocused}
						>
							{' '}
							Yes{' '}
						</Text>
					</Box>
					<Box>
						<Text
							color={!deleteFocused ? 'red' : 'white'}
							inverse={!deleteFocused}
						>
							{' '}
							No{' '}
						</Text>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Use ← → to navigate, Enter to select</Text>
				</Box>
			</Box>
		);
	}

	return null;
};

export default MergeWorktree;
