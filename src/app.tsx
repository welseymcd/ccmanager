import React, {useEffect, useState} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import {spawn, IPty} from 'node-pty';

const App: React.FC = () => {
	const {exit} = useApp();
	const [output, setOutput] = useState<string[]>([]);
	const [pty, setPty] = useState<IPty | null>(null);
	const [input, setInput] = useState('');

	useEffect(() => {
		const ptyProcess = spawn('claude', [], {
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: process.cwd(),
			env: process.env,
		});

		ptyProcess.onData((data: string) => {
			setOutput(prev => [...prev, data]);
		});

		ptyProcess.onExit(() => {
			exit();
		});

		setPty(ptyProcess);

		return () => {
			ptyProcess.kill();
		};
	}, [exit]);

	useInput((char, key) => {
		if (!pty) return;

		if (key.ctrl && char === 'c') {
			pty.write('\x03');
		} else if (key.ctrl && char === 'd') {
			pty.write('\x04');
		} else if (key.return) {
			pty.write(input + '\r');
			setInput('');
		} else if (key.backspace || key.delete) {
			setInput(prev => prev.slice(0, -1));
		} else if (char) {
			setInput(prev => prev + char);
		}
	});

	return (
		<Box flexDirection="column">
			<Box flexDirection="column" marginBottom={1}>
				{output.map((line, i) => (
					<Text key={i}>{line}</Text>
				))}
			</Box>
			{input && <Text>{'> ' + input}</Text>}
		</Box>
	);
};

export default App;