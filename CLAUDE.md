# CCManager - Claude Code Worktree Manager

## Overview

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It allows you to run Claude Code in parallel across different worktrees and switch between them seamlessly.

## Project Structure

```
ccmanager/
├── src/
│   ├── index.tsx           # Entry point
│   ├── app.tsx            # Main application component
│   ├── components/        # UI components
│   │   ├── Menu.tsx      # Main menu view
│   │   ├── Session.tsx   # Claude Code session view
│   │   └── StatusBar.tsx # Status indicators
│   ├── hooks/            # Custom React hooks
│   │   ├── useWorktree.ts   # Git worktree management
│   │   ├── useSession.ts    # Session lifecycle
│   │   └── useKeyboard.ts   # Global keyboard shortcuts
│   ├── services/         # Business logic
│   │   ├── sessionManager.ts # Claude Code process management
│   │   ├── worktreeService.ts # Git operations
│   │   └── stateDetector.ts  # Session state detection
│   └── types/            # TypeScript definitions
│       └── index.ts
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── .prettierrc
```

## Key Dependencies

- **ink** - React for CLI apps
- **ink-select-input** - Menu selection component
- **ink-spinner** - Loading indicators
- **node-pty** - PTY for interactive sessions
- **simple-git** - Git operations
- **chalk** - Terminal styling

## Commands

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
# or directly
npx ccmanager
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Type Check

```bash
npm run typecheck
```

## Architecture Decisions

### Why TypeScript + Ink?

- **React Patterns**: Leverages familiar React concepts for UI development
- **Type Safety**: TypeScript provides compile-time type checking
- **Rich Ecosystem**: Access to npm packages for PTY, Git, and more
- **Rapid Development**: Hot reloading and component reusability

### Session Management

- Each worktree maintains its own Claude Code process
- Sessions are managed via `node-pty` for full terminal emulation
- Process lifecycle tracked in React state with automatic cleanup

### UI Components

- **Menu Component**: Uses `ink-select-input` for navigation
- **Session Component**: Renders PTY output with ANSI color support
- **StatusBar**: Shows session states and keyboard shortcuts

### State Detection

Claude Code states are detected by output analysis:

- **Waiting for input**: Detecting prompts (">", "Press Enter")
- **Task in progress**: Active output without prompts
- **Needs interaction**: Specific interactive prompts

## Development Guidelines

### Component Structure

```tsx
// Example component pattern
const MyComponent: React.FC<Props> = ({prop1, prop2}) => {
	const [state, setState] = useState<State>(initialState);

	useEffect(() => {
		// Side effects
	}, [dependencies]);

	return (
		<Box flexDirection="column">
			<Text>Content</Text>
		</Box>
	);
};
```

### Testing Sessions

```typescript
// Mock Claude Code for testing
process.env.CLAUDE_COMMAND = './mock-claude';

// Create mock-claude script
const mockScript = `#!/usr/bin/env node
console.log('Claude Code Mock');
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt() {
  rl.question('> ', (answer) => {
    console.log(\`Processing: \${answer}\`);
    setTimeout(prompt, 1000);
  });
}
prompt();
`;
```

### Keyboard Handling

```tsx
useInput((input, key) => {
	if (key.ctrl && input === 'q') {
		// Return to menu
	}
});
```

## Common Issues

### PTY Compatibility

- Use `node-pty` prebuilt binaries for cross-platform support
- Handle Windows ConPTY vs Unix PTY differences
- Test on WSL, macOS, and Linux

### React Reconciliation

- Use `key` prop for session components
- Memoize expensive renders with `React.memo`
- Avoid recreating PTY instances unnecessarily

### Process Management

- Clean up PTY instances on unmount
- Handle orphaned processes gracefully
- Implement proper signal handling

## Future Enhancements

- Session recording and playback
- Split pane view for multiple sessions
- Integration with Claude Code's `-r` flag
- Theme customization
- Plugin system for extensions
