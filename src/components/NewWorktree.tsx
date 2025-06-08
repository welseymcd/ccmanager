import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';

interface NewWorktreeProps {
	onComplete: (path: string, branch: string) => void;
	onCancel: () => void;
}

type Step = 'path' | 'branch';

const NewWorktree: React.FC<NewWorktreeProps> = ({onComplete, onCancel}) => {
	const [step, setStep] = useState<Step>('path');
	const [path, setPath] = useState('');
	const [branch, setBranch] = useState('');

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
		}
	});

	const handlePathSubmit = (value: string) => {
		if (value.trim()) {
			setPath(value.trim());
			setStep('branch');
		}
	};

	const handleBranchSubmit = (value: string) => {
		if (value.trim()) {
			setBranch(value.trim());
			onComplete(path, value.trim());
		}
	};


	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Create New Worktree
				</Text>
			</Box>

			{step === 'path' ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Enter worktree path (relative to repository root):</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInput
							value={path}
							onChange={setPath}
							onSubmit={handlePathSubmit}
							placeholder="e.g., ../myproject-feature"
						/>
					</Box>
				</Box>
			) : (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Enter branch name for worktree at <Text color="cyan">{path}</Text>
							:
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInput
							value={branch}
							onChange={setBranch}
							onSubmit={handleBranchSubmit}
							placeholder="e.g., feature/new-feature"
						/>
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Press ESC to cancel</Text>
			</Box>
		</Box>
	);
};

export default NewWorktree;
