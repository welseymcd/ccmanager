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
					process.stdout.rows || 24
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

		if (key.ctrl && char === 'c') {
			pty.write('\x03');
		} else if (key.ctrl && char === 'd') {
			pty.write('\x04');
		} else if (key.ctrl && char === 'a') {
			pty.write('\x01');
		} else if (key.ctrl && char === 'k') {
			pty.write('\x0B');
		} else if (key.ctrl && char === 'l') {
			pty.write('\x0C');
		} else if (key.ctrl && char === 'u') {
			pty.write('\x15');
		} else if (key.ctrl && char === 'w') {
			pty.write('\x17');
		} else if (key.return) {
			pty.write('\r');
		} else if (key.backspace || key.delete) {
			pty.write('\x7F');
		} else if (key.tab) {
			pty.write('\t');
		} else if (key.escape) {
			pty.write('\x1B');
		} else if (key.upArrow) {
			pty.write('\x1B[A');
		} else if (key.downArrow) {
			pty.write('\x1B[B');
		} else if (key.leftArrow) {
			pty.write('\x1B[D');
		} else if (key.rightArrow) {
			pty.write('\x1B[C');
		} else if (char) {
			pty.write(char);
		}
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