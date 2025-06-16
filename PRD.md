# Product Requirements Document: CCManager Web Interface

## Executive Summary

CCManager Web Interface is a web-based version of the CCManager CLI tool, providing individual developers with a modern browser-based UI for managing multiple Claude Code sessions across Git worktrees. The primary goal is to deliver a superior user experience compared to the CLI, with **multiple terminal tabs** as the flagship feature.

## Product Overview

### Vision
Transform CCManager from a CLI tool into a modern web application that makes managing multiple Claude Code sessions intuitive and efficient.

### Target Users
Individual developers who:
- Work with multiple Git branches simultaneously
- Want a visual interface for managing Claude Code sessions
- Prefer browser-based tools over terminal applications
- Need to maintain context across multiple coding sessions

### Key Value Propositions
1. **Multiple concurrent sessions** - Run Claude Code in different worktrees simultaneously
2. **Tab-based interface** - Switch between sessions without losing context
3. **Session persistence** - Resume work after disconnections or browser refreshes
4. **Visual worktree management** - See and manage Git worktrees graphically
5. **Self-hosted control** - Run on local machine or personal server

## Functional Requirements

### MVP Features (v1.0)

#### 1. Multi-Tab Terminal Interface
- **Multiple terminal tabs** for different Claude Code sessions
- Tab creation, switching, and closing
- Visual indicators for session state (active, idle, waiting)
- Persistent tab state across browser refreshes

#### 2. Terminal Emulation
- Full xterm.js-based terminal emulator
- ANSI color support
- Copy/paste functionality
- Terminal resizing
- Scrollback buffer

#### 3. Session Management
- Create new Claude Code sessions
- Attach to existing sessions
- Session persistence during disconnections
- Terminal history storage and retrieval
- Graceful handling of session crashes

#### 4. Worktree Operations
- List available Git worktrees
- Create new worktrees
- Delete worktrees
- Basic status information

#### 5. Real-time Communication
- WebSocket-based bidirectional communication
- Automatic reconnection with exponential backoff
- Message queuing during disconnections
- Connection status indicators

#### 6. Authentication
- Simple password-based authentication for local deployments
- Session-based auth tokens
- Optional local-only mode (no auth)

### Future Features (Post-MVP)

- File browser integration
- Rich session history with search
- Drag-and-drop worktree management
- Split pane views
- Collaborative session sharing
- Session recording and playback
- Git visualization
- Integrated code editor

## Technical Requirements

### Architecture

Client-server architecture with:
- **Frontend**: React SPA with modern web technologies
- **Backend**: Node.js service managing PTY sessions
- **Communication**: WebSocket for real-time data
- **Storage**: SQLite for session history, localStorage for UI state

### Frontend Stack
- React 18+
- TanStack Router for navigation
- TanStack Query for server state
- Zustand for local state management
- xterm.js for terminal emulation
- shadcn/ui components (Radix UI + Tailwind CSS)
- Vite for build tooling

### Backend Stack
- Node.js 18+
- Express.js for HTTP server
- Socket.io for WebSocket communication
- node-pty for PTY management
- SQLite for session history
- bcrypt for password hashing

### Database Schema

```sql
-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  working_dir TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active'
);

-- Terminal history
CREATE TABLE terminal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'output',
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### WebSocket Protocol

#### Client → Server
- `terminal_input`: User keyboard input
- `create_session`: Start new Claude Code session
- `close_session`: Terminate session
- `resize_terminal`: Terminal dimension changes

#### Server → Client
- `terminal_output`: Claude Code output
- `session_created`: New session confirmation
- `session_closed`: Session termination
- `session_error`: Error notifications
- `connection_status`: Connection state updates

## Non-Functional Requirements

### Performance
- Sub-100ms latency for local deployments
- Support 10+ concurrent sessions
- Terminal history up to 10,000 lines per session
- Smooth scrolling and rendering at 60fps

### Security
- Encrypted WebSocket connections (WSS)
- Session tokens with expiration
- Input sanitization
- Process isolation between sessions
- No storage of Claude API keys

### Reliability
- Automatic reconnection on network interruptions
- Session persistence across server restarts
- Graceful degradation on connection loss
- Error recovery without data loss

### Usability
- Intuitive tab management
- Keyboard shortcuts for common actions
- Responsive design (desktop-first)
- Clear visual feedback for all actions
- Minimal configuration required

### Deployment
- Docker container support
- Single binary distribution
- Environment-based configuration
- Reverse proxy compatible
- Cross-platform (Linux, macOS, Windows via WSL)

## Success Metrics

1. **Adoption Rate**: 50% of current CLI users try web version
2. **Session Duration**: Average session >30 minutes
3. **Tab Usage**: Users average 3+ tabs per session
4. **Reliability**: <1% session loss rate
5. **Performance**: <100ms input latency

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Basic Express + Socket.io server
- React app with xterm.js
- Single session PTY management
- WebSocket communication

### Phase 2: Multi-Session (Weeks 3-4)
- Tab management UI
- Multiple PTY session handling
- Session state persistence
- SQLite integration

### Phase 3: CCManager Features (Weeks 5-6)
- Worktree listing and creation
- Session restoration
- Authentication system
- Connection resilience

### Phase 4: Polish & Deploy (Weeks 7-8)
- UI refinements
- Performance optimization
- Docker packaging
- Documentation

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PTY compatibility issues | High | Test on multiple platforms early |
| WebSocket connection stability | Medium | Implement robust reconnection logic |
| Session state synchronization | Medium | Use event sourcing pattern |
| Performance with many tabs | Medium | Lazy loading and virtualization |
| Security vulnerabilities | High | Security audit before release |

## Open Questions

1. Should we support collaborative features in v1?
2. How to handle Claude API key rotation?
3. Should we implement usage analytics?
4. Mobile support priority?
5. Integration with CCManager CLI?

## Appendix

### User Stories

1. **As a developer**, I want to run Claude Code in multiple Git branches simultaneously so I can work on different features in parallel.

2. **As a developer**, I want my sessions to persist when I close my browser so I can resume work later.

3. **As a developer**, I want to see which sessions are actively processing so I know where Claude needs input.

4. **As a developer**, I want to create new worktrees without leaving the UI so I can quickly start new features.

5. **As a developer**, I want to search through session history so I can find previous commands and outputs.