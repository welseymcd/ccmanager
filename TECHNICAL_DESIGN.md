# CCManager Technical Design Document

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CCManager App                        │
├─────────────────────────────────────────────────────────┤
│                    Ink React Layer                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │    Menu     │  │   Session    │  │   StatusBar   │ │
│  │  Component  │  │  Component   │  │   Component   │ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Service Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Worktree   │  │   Session    │  │    State      │ │
│  │   Service   │  │   Manager    │  │   Detector    │ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   External APIs                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ simple-git  │  │   node-pty   │  │ Claude Code   │ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Application Startup
```typescript
index.tsx
  ↓ render
App.tsx (state management)
  ↓ initialization
worktreeService.getWorktrees()
  ↓ worktree list
Menu.tsx (display)
```

### 2. Session Start
```typescript
Menu.tsx (selection)
  ↓ onSelect
App.tsx (routing)
  ↓ createSession
sessionManager.startSession(worktreePath)
  ↓ PTY process
Session.tsx (display)
```

### 3. State Monitoring
```typescript
PTY output stream
  ↓ data event
stateDetector.analyze(output)
  ↓ state change
App.tsx (state update)
  ↓ re-render
StatusBar.tsx (display update)
```

## Component Detailed Design

### App.tsx - Main Container
```typescript
interface AppState {
  view: 'menu' | 'session';
  worktrees: Worktree[];
  sessions: Map<string, Session>;
  activeSessionId: string | null;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: 'menu',
    worktrees: [],
    sessions: new Map(),
    activeSessionId: null,
  });

  useKeyboard((input, key) => {
    if (key.ctrl && input === 'q') {
      setState(prev => ({ ...prev, view: 'menu' }));
    }
  });

  return (
    <Box flexDirection="column">
      {state.view === 'menu' ? (
        <Menu 
          worktrees={state.worktrees}
          sessions={state.sessions}
          onSelect={handleWorktreeSelect}
        />
      ) : (
        <Session 
          session={state.sessions.get(state.activeSessionId!)}
          onOutput={handleSessionOutput}
        />
      )}
      <StatusBar sessions={state.sessions} />
    </Box>
  );
};
```

### Menu.tsx - Menu Component
```typescript
interface MenuProps {
  worktrees: Worktree[];
  sessions: Map<string, Session>;
  onSelect: (worktree: Worktree) => void;
}

const Menu: React.FC<MenuProps> = ({ worktrees, sessions, onSelect }) => {
  const items = [
    { label: '🆕 Start new session', value: 'new' },
    ...worktrees.map(wt => ({
      label: `${getStatusIcon(wt, sessions)} ${wt.branch} - ${wt.path}`,
      value: wt.path,
    })),
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="green">CCManager - Claude Code Worktree Manager</Text>
      <Text dimColor>Press Ctrl+Q to return to menu</Text>
      <SelectInput items={items} onSelect={handleSelect} />
    </Box>
  );
};
```

### Session.tsx - Session View
```typescript
interface SessionProps {
  session: Session;
  onOutput: (data: string) => void;
}

const Session: React.FC<SessionProps> = ({ session }) => {
  const [output, setOutput] = useState<string[]>([]);

  useEffect(() => {
    const pty = session.process;
    
    pty.onData((data) => {
      setOutput(prev => [...prev, data]);
    });

    // Pass through keyboard input
    useStdin().on('data', (data) => {
      pty.write(data.toString());
    });

    return () => {
      pty.kill();
    };
  }, [session]);

  return (
    <Box flexDirection="column" height="100%">
      <Text>{output.join('')}</Text>
    </Box>
  );
};
```

## Service Layer Design

### sessionManager.ts
```typescript
export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  async startSession(worktreePath: string): Promise<Session> {
    const pty = spawn('claude', [], {
      name: 'xterm-color',
      cwd: worktreePath,
      env: process.env,
      cols: process.stdout.columns,
      rows: process.stdout.rows,
    });

    const session: Session = {
      id: generateId(),
      worktreePath,
      process: pty,
      state: 'idle',
      output: [],
    };

    this.sessions.set(session.id, session);
    this.monitorSession(session);

    return session;
  }

  private monitorSession(session: Session): void {
    session.process.onData((data) => {
      session.output.push(data);
      session.state = this.detectState(session.output);
    });
  }
}
```

### stateDetector.ts
```typescript
export class StateDetector {
  private patterns = {
    waitingForInput: [
      />\s*$/,
      /Press Enter to continue/,
      /\[Y\/n\]/,
    ],
    busy: [
      /Processing/,
      /Loading/,
      /Working/,
    ],
  };

  detect(output: string[]): SessionState {
    const recentOutput = output.slice(-10).join('');
    
    // Check for input prompts
    if (this.patterns.waitingForInput.some(p => p.test(recentOutput))) {
      return 'waiting_input';
    }
    
    // Check for activity in last 2 seconds
    if (this.hasRecentActivity(output)) {
      return 'busy';
    }
    
    return 'idle';
  }
}
```

### worktreeService.ts
```typescript
export class WorktreeService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async getWorktrees(): Promise<Worktree[]> {
    const result = await this.git.raw(['worktree', 'list', '--porcelain']);
    return this.parseWorktreeList(result);
  }

  private parseWorktreeList(output: string): Worktree[] {
    const worktrees: Worktree[] = [];
    const lines = output.split('\n');
    
    let current: Partial<Worktree> = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as Worktree);
        }
        current = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      }
    }
    
    if (current.path) {
      worktrees.push(current as Worktree);
    }
    
    return worktrees;
  }
}
```

## Error Handling Strategy

### 1. Process Crash
```typescript
session.process.onExit((code) => {
  if (code !== 0) {
    session.state = 'crashed';
    // Auto-restart option
    if (config.autoRestart) {
      setTimeout(() => restartSession(session), 5000);
    }
  }
});
```

### 2. PTY Initialization Error
```typescript
try {
  const pty = spawn('claude', [], options);
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error('Claude Code not found. Please install it first.');
  }
  throw error;
}
```

### 3. Git Operation Error
```typescript
try {
  const worktrees = await git.worktree.list();
} catch (error) {
  // Fallback: display current directory only
  return [{ path: process.cwd(), branch: 'main', isMainWorktree: true }];
}
```

## Performance Optimization

### 1. Output Buffering
```typescript
const OutputBuffer = () => {
  const [buffer, setBuffer] = useState<string[]>([]);
  const flushTimer = useRef<NodeJS.Timeout>();

  const addOutput = (data: string) => {
    setBuffer(prev => [...prev, data]);
    
    // Batch updates
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      // Actual rendering
    }, 16); // 60fps
  };
};
```

### 2. Virtual Scrolling
```typescript
const VirtualOutput = ({ lines, height }) => {
  const [scrollTop, setScrollTop] = useState(0);
  const visibleLines = Math.floor(height / LINE_HEIGHT);
  
  const startIndex = Math.floor(scrollTop / LINE_HEIGHT);
  const endIndex = startIndex + visibleLines;
  
  return lines.slice(startIndex, endIndex).map(renderLine);
};
```

### 3. Memoization
```typescript
const SessionStatus = React.memo(({ session }) => {
  return <Text color={getStatusColor(session.state)}>{session.state}</Text>;
}, (prev, next) => prev.session.state === next.session.state);
```