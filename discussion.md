# CCManager Web Interface Implementation Plan

## Architecture Decision: Client-Server Model

### High-Level Architecture

```
┌─────────────────┐    WebSocket    ┌──────────────────┐    PTY     ┌─────────────────┐
│   Web Browser   │ ◄─────────────► │  Backend Service │ ◄────────► │  Claude Code    │
│  (React + UI)   │                 │   (Node.js)      │            │   Processes     │
└─────────────────┘                 └──────────────────┘            └─────────────────┘
                                             │                              │
                                             ▼                              ▼
                                    ┌──────────────────┐            ┌─────────────────┐
                                    │   Session Store  │            │   Git Repos     │
                                    │   (SQLite/Redis) │            │ (Local FS)      │
                                    └──────────────────┘            └─────────────────┘
```

## Key Questions to Resolve

### 1. Target Users

**Answer**: Individual developers wanting a better UI than CLI

### 2. Deployment Model

**Answer**: Self-hosted (local or personal server)

### 3. MVP Feature Set

**Must-have features for v1**:

- [x] Web-based terminal emulator
- [x] **Multiple terminal tabs** (PRIMARY FEATURE)
- [x] Basic worktree management
- [x] Session persistence
- [x] WebSocket real-time communication
- [x] Simple authentication (password/local-only)

**Nice-to-have for v1**:

- [ ] File browser
- [ ] Session history
- [ ] Drag-and-drop worktree management

## Technical Implementation Plan

### Phase 1: Core Infrastructure

1. **Backend Service Setup**
- Node.js/Express server
- WebSocket support (socket.io)
- PTY integration (node-pty)
- Session management
1. **Frontend Foundation**
- React application
- xterm.js terminal emulator
- WebSocket client integration
- Basic UI layout
1. **Authentication & Security**
- Session-based auth
- API key management
- CORS configuration

### Phase 2: CCManager Integration

1. **PTY Session Management**
- Spawn/manage Claude Code processes
- Handle process lifecycle
- Session persistence across reconnects
1. **Worktree Operations**
- Git repository detection
- Worktree creation/deletion
- Status monitoring

### Phase 3: Enhanced UI

1. **Rich Terminal Interface**
- Multiple tabs/panes
- Terminal history
- Copy/paste support
1. **Worktree Management UI**
- Visual worktree browser
- Drag-and-drop operations
- Git status visualization

## Technology Stack

### Backend

- **Runtime**: Node.js
- **Framework**: Express.js
- **WebSocket**: Socket.io
- **PTY**: node-pty
- **Database**: SQLite (start) → PostgreSQL (scale)
- **Auth**: Passport.js or Auth0

### Frontend

- **Framework**: React
- **Router**: TanStack Router
- **State Management**: TanStack Query + Zustand (local state)
- **UI Components**: shadcn/ui (Radix + Tailwind)
- **Terminal**: xterm.js + xterm-addon-*
- **Styling**: Tailwind CSS
- **Build**: Vite

### DevOps

- **Container**: Docker
- **Orchestration**: Docker Compose
- **Reverse Proxy**: nginx
- **SSL**: Let’s Encrypt

## Security Considerations

### API Key Management

- Secure storage (encrypted at rest)
- Environment variable injection
- Per-user API key isolation

### Process Isolation

- Containerized Claude Code processes
- Resource limits (CPU/memory)
- Network isolation

### Authentication

- JWT tokens for API access
- Session management
- Rate limiting

## WebSocket Architecture

### Message Protocol

#### Client → Server Messages

```typescript
// Terminal input (user typing)
{
  type: 'terminal_input',
  sessionId: string,
  data: string  // raw terminal input
}

// Session management
{
  type: 'create_session',
  workingDir?: string,
  command?: string  // defaults to 'ccmanager'
}

{
  type: 'close_session',
  sessionId: string
}

{
  type: 'resize_terminal',
  sessionId: string,
  cols: number,
  rows: number
}
```

#### Server → Client Messages

```typescript
// Terminal output
{
  type: 'terminal_output',
  sessionId: string,
  data: string  // raw terminal output
}

// Session lifecycle
{
  type: 'session_created',
  sessionId: string,
  workingDir: string
}

{
  type: 'session_closed',
  sessionId: string,
  exitCode?: number
}

{
  type: 'session_error',
  sessionId: string,
  error: string
}

// Connection status
{
  type: 'connection_status',
  status: 'connected' | 'disconnected' | 'reconnecting'
}
```

### Backend Session Management

```typescript
class SessionManager {
  private sessions = new Map<string, PTYSession>();
  
  createSession(workingDir?: string): string {
    const sessionId = generateId();
    const ptyProcess = spawn('ccmanager', [], {
      cwd: workingDir || process.cwd(),
      cols: 80,
      rows: 24
    });
    
    this.sessions.set(sessionId, {
      id: sessionId,
      pty: ptyProcess,
      workingDir,
      createdAt: new Date()
    });
    
    return sessionId;
  }
  
  writeToSession(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.write(data);
    }
  }
  
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }
}
```

## GUI-First Architecture (Revised)

### CCManager Integration Points

**CCManager State Awareness:**

- CCManager can detect when Claude Code needs user input
- CCManager knows current worktree state, active sessions
- CCManager can provide structured data vs raw terminal output

### GUI Components Instead of Terminal

**Primary Interface:**

```typescript
<App>
  <Sidebar>
    <WorktreeManager /> {/* Visual worktree browser */}
    <SessionList />     {/* Active Claude Code sessions */}
  </Sidebar>
  
  <MainContent>
    <TabsContainer>
      <SessionTab sessionId="sess_123">
        <ClaudeCodeInterface /> {/* Interactive Claude session */}
        <FileExplorer />        {/* Current directory files */}
        <OutputPanel />         {/* Formatted command output */}
      </SessionTab>
    </TabsContainer>
  </MainContent>
  
  <StatusBar>
    <ConnectionStatus />
    <ActiveOperations />
  </StatusBar>
</App>
```

**Rich Session Interface:**

- **Claude Input Panel**: Rich text input when Claude needs user input
- **Command History**: Structured list of commands executed
- **File Changes**: Visual diff of files Claude modified
- **Progress Indicators**: Show long-running operations
- **Interactive Prompts**: GUI forms instead of terminal prompts

### Data Flow Changes

**Structured Messages vs Raw Terminal:**

```typescript
// Instead of raw terminal data
{ type: 'terminal_output', data: 'raw string' }

// Structured CCManager events
{ 
  type: 'claude_waiting_for_input',
  sessionId: string,
  prompt: string,
  context: 'file_edit' | 'command_confirm' | 'user_question'
}

{
  type: 'operation_progress',
  sessionId: string,
  operation: 'analyzing_codebase' | 'generating_files',
  progress: 0.65,
  message: 'Processing src/components...'
}

{
  type: 'file_changes',
  sessionId: string,
  changes: Array<{
    path: string,
    type: 'created' | 'modified' | 'deleted',
    diff?: string
  }>
}
```

### Connection Resilience

#### Reconnection Strategy

- Auto-reconnect with exponential backoff
- Queue messages during disconnection
- Restore session state on reconnect
- Show connection status in UI

#### Session Persistence

- **Lifetime**: Sessions persist until server restart OR explicit user deletion
- **No auto-cleanup**: Sessions stay alive indefinitely during disconnections
- **User Control**: Manual “Close Tab” action sends `close_session` message
- **Server Restart Recovery**: On restart, all sessions are lost (expected behavior)

#### Reconnection Strategy

- **State Persistence**: Tab state stored in localStorage survives browser refresh
- **Session Restoration**: On reconnect, restore all tabs from localStorage
- **Server Session Cache**: Backend maintains session registry for reconnection
- **Auto-Reconnect**: Connect to existing sessions by sessionId on page load
- **Default Session**: If no localStorage state, auto-create one default session

#### Session State Management

**Frontend localStorage Schema:**

```typescript
interface PersistedTabState {
  tabs: Array<{
    id: string;
    sessionId: string;
    title: string;
    active: boolean;
    workingDir?: string;
    createdAt: string;
  }>;
  activeTabId: string;
}
```

**Backend Session Registry:**

```typescript
class SessionManager {
  private sessions = new Map<string, PTYSession>();
  
  // Get list of active sessions for reconnection
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      workingDir: session.workingDir,
      createdAt: session.createdAt,
      isAlive: !session.pty.killed
    }));
  }
  
  // Validate session exists before reconnecting
  sessionExists(sessionId: string): boolean {
    return this.sessions.has(sessionId) && !this.sessions.get(sessionId)?.pty.killed;
  }
}
```

#### Terminal History Storage

**SQLite Database Schema:**

```sql
-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  working_dir TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active' -- 'active', 'closed', 'crashed'
);

-- Terminal output lines
CREATE TABLE terminal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'output', -- 'output', 'input', 'system'
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_terminal_lines_session_timestamp ON terminal_lines(session_id, timestamp);
CREATE INDEX idx_terminal_lines_session_line_number ON terminal_lines(session_id, line_number);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);
```

**Backend Terminal History Manager:**

```typescript
class TerminalHistoryManager {
  private db: Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }
  
  // Store terminal output line by line
  async appendOutput(sessionId: string, content: string, type: 'output' | 'input' | 'system' = 'output'): Promise<void> {
    const lines = content.split('\n');
    const lastLineNumber = await this.getLastLineNumber(sessionId);
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0 || i < lines.length - 1) { // Skip empty last line
        await this.db.run(`
          INSERT INTO terminal_lines (session_id, line_number, content, type)
          VALUES (?, ?, ?, ?)
        `, [sessionId, lastLineNumber + i + 1, lines[i], type]);
      }
    }
    
    // Update session last activity
    await this.db.run(`
      UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
    `, [sessionId]);
  }
  
  // Get terminal history for reconnection
  async getSessionHistory(sessionId: string, fromLine?: number): Promise<TerminalLine[]> {
    const query = fromLine 
      ? `SELECT * FROM terminal_lines WHERE session_id = ? AND line_number >= ? ORDER BY line_number`
      : `SELECT * FROM terminal_lines WHERE session_id = ? ORDER BY line_number`;
    
    const params = fromLine ? [sessionId, fromLine] : [sessionId];
    return this.db.all(query, params);
  }
  
  // Get recent lines (for initial reconnection)
  async getRecentHistory(sessionId: string, lineCount: number = 1000): Promise<TerminalLine[]> {
    return this.db.all(`
      SELECT * FROM terminal_lines 
      WHERE session_id = ? 
      ORDER BY line_number DESC 
      LIMIT ?
    `, [sessionId, lineCount]).then(rows => rows.reverse());
  }
  
  // Create session record
  async createSession(sessionId: string, workingDir?: string): Promise<void> {
    await this.db.run(`
      INSERT INTO sessions (id, working_dir) VALUES (?, ?)
    `, [sessionId, workingDir || process.cwd()]);
  }
  
  // Mark session as closed
  async closeSession(sessionId: string): Promise<void> {
    await this.db.run(`
      UPDATE sessions SET status = 'closed' WHERE id = ?
    `, [sessionId]);
  }
}
```

**Enhanced Session Manager Integration:**

```typescript
class SessionManager {
  private sessions = new Map<string, PTYSession>();
  private history: TerminalHistoryManager;
  
  constructor() {
    this.history = new TerminalHistoryManager('./data/terminal_history.db');
  }
  
  createSession(workingDir?: string): string {
    const sessionId = generateId();
    const ptyProcess = spawn('ccmanager', [], {
      cwd: workingDir || process.cwd(),
      cols: 80,
      rows: 24
    });
    
    // Store all output to database
    ptyProcess.onData((data: string) => {
      this.history.appendOutput(sessionId, data, 'output');
      // Also broadcast to connected clients
      this.broadcastToSession(sessionId, data);
    });
    
    this.sessions.set(sessionId, { id: sessionId, pty: ptyProcess, workingDir });
    this.history.createSession(sessionId, workingDir);
    
    return sessionId;
  }
  
  writeToSession(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Store user input
      this.history.appendOutput(sessionId, data, 'input');
      session.pty.write(data);
    }
  }
}
```

**Frontend: History Restoration**

```typescript
// On reconnection, get and display history
{
  type: 'session_reconnected',
  sessionId: string,
  history: Array<{
    lineNumber: number,
    content: string,
    type: 'output' | 'input' | 'system',
    timestamp: string
  }>
}
```