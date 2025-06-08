import React, {useEffect, useState} from 'react';
import {Box, Text, useInput, useApp, useStdout} from 'ink';
import {spawn, IPty} from 'node-pty';

interface AppProps {
	onReturnToMenu?: () => void;
}

const App: React.FC<AppProps> = ({onReturnToMenu}) => {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const [pty, setPty] = useState<IPty | null>(null);
	const [showMenu, setShowMenu] = useState(false);

	useEffect(() => {
		const ptyProcess = spawn('claude', [], {
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: process.cwd(),
			env: process.env,
		});

		ptyProcess.onData((data: string) => {
			if (stdout) {
				stdout.write(data);
			}
		});

		ptyProcess.onExit(() => {
			exit();
		});

		setPty(ptyProcess);

		if (stdout) {
			stdout.on('resize', () => {
				ptyProcess.resize(
					process.stdout.columns || 80,
					process.stdout.rows || 24,
				);
			});
		}

		return () => {
			ptyProcess.kill();
		};
	}, [exit, stdout]);

	useInput((char, key) => {
		if (!pty) return;

		if (key.ctrl && char === 'e') {
			if (onReturnToMenu) {
				onReturnToMenu();
			} else {
				setShowMenu(true);
			}
			return;
		}

		// if (char) {
		// 	pty.write(char);
		// }
	});

	if (showMenu) {
		return (
			<Box flexDirection="column">
				<Text color="green">Press Ctrl+E to return to menu</Text>
			</Box>
		);
	}

	return null;
};

export default App;
