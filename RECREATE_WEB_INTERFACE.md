# CCManager Web Interface Recreation Prompt

## Project Overview

Create a web-based terminal session manager called "CCManager Web" that allows users to manage multiple Claude Code (or any terminal-based) sessions across different projects. The application should provide persistent terminal sessions using tmux, real-time WebSocket communication, and a responsive interface for both desktop and mobile devices.

## Core Features

### 1. Authentication System
- Simple username-based authentication (no passwords required for MVP)
- Persistent sessions using localStorage
- User isolation (each user can only see their own projects and sessions)

### 2. Project Management
- Create and manage multiple projects
- Each project has:
  - Unique ID (hash-based)
  - Name
  - Working directory path
  - Creation timestamp
  - Last access timestamp
- Projects persist in SQLite database

### 3. Terminal Sessions
- Multiple terminal types per project:
  - Main session (Claude Code or custom command)
  - Dev server session (npm run dev or custom command)
- Features:
  - Full terminal emulation using xterm.js
  - Persistent sessions using tmux (survives server restarts)
  - Session history stored in SQLite
  - Real-time bidirectional communication via WebSocket
  - Terminal resize support
  - Copy/paste support
  - Search functionality (Ctrl+Shift+F)

### 4. Session Persistence
- Tmux integration for session persistence
- Automatic session restoration on reconnect
- Database storage of session history
- Graceful handling of disconnections

## Technical Architecture

### Backend Stack
- **Language**: TypeScript/Node.js
- **Framework**: Express.js
- **WebSocket**: Socket.io
- **Database**: SQLite3 with better-sqlite3
- **Terminal**: node-pty for PTY management
- **Session Management**: tmux for persistence
- **Process Management**: Custom session manager
- **Logging**: Winston logger

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Terminal**: xterm.js with addons (fit, search, web-links)
- **WebSocket Client**: socket.io-client
- **State Management**: React hooks and context
- **Icons**: Lucide React

### Database Schema

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    working_dir TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    working_dir TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    exit_code INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Session history table
CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sequence INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

## Key Implementation Details

### 1. WebSocket Protocol

Define TypeScript interfaces for WebSocket messages:

```typescript
// Client to Server messages
interface ClientToServerMessage {
  type: 'authenticate' | 'create_project' | 'create_session' | 
        'terminal_input' | 'resize_terminal' | 'close_session' |
        'get_session_buffer' | 'list_sessions' | 'subscribe_session';
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  // ... other fields
}

// Server to Client messages
interface ServerToClientMessage {
  type: 'authenticated' | 'session_created' | 'terminal_output' |
        'session_closed' | 'session_error' | 'session_buffer';
  sessionId?: string;
  data?: string;
  buffer?: string;
  error?: string;
  // ... other fields
}
```

### 2. Session Manager

Create a robust session manager that:
- Manages PTY processes using node-pty
- Integrates with tmux for persistence
- Handles session lifecycle (create, attach, destroy)
- Manages output buffers
- Filters terminal escape sequences
- Implements automatic reattachment for restored sessions

Key methods:
- `createSession()`: Creates new tmux session and PTY
- `writeToSession()`: Sends input to terminal
- `resizeSession()`: Handles terminal resize
- `reattachTmuxSession()`: Reattaches to existing tmux session
- `getSessionBuffer()`: Retrieves session history

### 3. Terminal Component

React component that:
- Initializes xterm.js terminal
- Handles bidirectional data flow
- Manages terminal lifecycle
- Filters escape sequences to prevent loops
- Implements proper cleanup on unmount

Key features:
- Device attribute escape sequence filtering
- Automatic resize handling
- Buffer restoration on reconnect
- Error state management

### 4. Tmux Integration

Critical tmux handling:
- Use detached sessions: `tmux new-session -d`
- Attach with client detachment: `tmux attach-session -d`
- Proper environment variables to prevent loops
- Buffer capture: `tmux capture-pane -p`
- Status line filtering in captured output

### 5. Mobile Responsiveness

- Responsive navigation with hamburger menu
- Touch-friendly controls
- Proper viewport handling
- Terminal scaling for mobile devices

## Critical Edge Cases to Handle

1. **Escape Sequence Loops**: Filter device attribute requests (ESC[>0;276;0c) to prevent feedback loops
2. **Tmux Status Lines**: Filter repeated status lines when capturing pane content
3. **Session Restoration**: Ensure PTY is reattached before any operations
4. **Multiple Clients**: Use tmux attach with -d flag to prevent conflicts
5. **Database Persistence**: Store terminal output with proper escape sequence handling
6. **WebSocket Reconnection**: Gracefully handle disconnections and restore session state

## Security Considerations

1. User isolation via session IDs
2. Path validation for working directories
3. Command sanitization
4. WebSocket authentication
5. No arbitrary command execution without user context

## Performance Optimizations

1. Buffer size limits (10MB per session)
2. Database cleanup for old sessions
3. Throttled terminal output updates
4. Efficient WebSocket message batching
5. Lazy loading of session buffers

## Deployment Configuration

Environment variables:
- `PORT`: Server port (default: 3001)
- `CLAUDE_COMMAND`: Override Claude command
- `DATABASE_PATH`: SQLite database location
- `SESSION_RETENTION_DAYS`: How long to keep old sessions

## Testing Approach

1. Unit tests for session manager
2. Integration tests for WebSocket handlers
3. E2E tests for terminal interaction
4. Tmux attachment/detachment scenarios
5. Multi-client session handling

This web interface provides a robust, production-ready terminal session manager with persistence, real-time updates, and a responsive UI suitable for managing multiple development sessions.