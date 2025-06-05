# CCManager Implementation Plan

## Overview
CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It will be implemented using TypeScript + Ink framework.

## Phase 1: Foundation Building (1-2 days)

### 1.1 Project Setup
- [ ] Create package.json
- [ ] TypeScript configuration (tsconfig.json)
- [ ] ESLint/Prettier setup
- [ ] Basic Ink application structure

### 1.2 Development Environment
- [ ] Hot reloading setup
- [ ] Debug environment setup
- [ ] Create mock Claude Code (for testing)

## Phase 2: Core Feature Implementation (3-4 days)

### 2.1 Git Worktree Management
```typescript
interface Worktree {
  path: string;
  branch: string;
  isMainWorktree: boolean;
  hasSession: boolean;
}
```
- [ ] worktreeService.ts - Get Git worktree list
- [ ] Detect worktrees in current repository
- [ ] Worktree state management

### 2.2 Basic UI Implementation
- [ ] Menu.tsx - Main menu component
  - New session start option
  - Display existing worktree list
  - Session state indicators
- [ ] App.tsx - Routing and view management
- [ ] useKeyboard.ts - Global keyboard shortcuts (Ctrl+Q)

### 2.3 Session Management Foundation
```typescript
interface Session {
  id: string;
  worktreePath: string;
  process: IPty;
  state: 'idle' | 'busy' | 'waiting_input';
  output: string[];
}
```
- [ ] sessionManager.ts - Process lifecycle management
- [ ] PTY initialization and Claude Code startup
- [ ] Session creation/destruction

## Phase 3: Session View Implementation (2-3 days)

### 3.1 Session.tsx Implementation
- [ ] PTY output rendering
- [ ] ANSI color support
- [ ] Scroll functionality
- [ ] Input passthrough

### 3.2 State Detection System
- [ ] stateDetector.ts - Output pattern analysis
  - Detect "Press Enter to continue"
  - Detect prompt (">")
  - Detect active output
- [ ] Automatic session state updates

### 3.3 Session Switching
- [ ] Fast switching between sessions
- [ ] Preserve session state
- [ ] Monitor background sessions

## Phase 4: Advanced Features (2-3 days)

### 4.1 Enhanced State Display
- [ ] StatusBar.tsx - Display all session states
- [ ] Notification system (task completion)
- [ ] Real-time session list updates

### 4.2 Error Handling
- [ ] Process crash detection and recovery
- [ ] Invalid worktree handling
- [ ] User-friendly error messages

### 4.3 Configuration and Customization
- [ ] config.ts - Configuration management
- [ ] Custom keyboard shortcuts
- [ ] Theme/color settings

## Phase 5: Optimization and Testing (1-2 days)

### 5.1 Performance Optimization
- [ ] Optimize rendering for large outputs
- [ ] Memory usage optimization
- [ ] Reduce unnecessary re-renders

### 5.2 Testing
- [ ] Unit tests (service layer)
- [ ] Integration tests (session management)
- [ ] E2E tests (UI operations)

### 5.3 Documentation
- [ ] Update README.md
- [ ] Usage guide
- [ ] Troubleshooting guide

## Technical Challenges and Solutions

### 1. PTY Management
**Challenge**: Proper node-pty initialization and cleanup
**Solution**: 
```typescript
useEffect(() => {
  const pty = spawn('claude', [], {
    cwd: worktreePath,
    env: process.env,
  });
  
  return () => {
    pty.kill();
  };
}, [worktreePath]);
```

### 2. State Detection Reliability
**Challenge**: Claude Code output patterns may change
**Solution**: 
- Multiple pattern matching
- Timeout-based auxiliary detection
- Configurable pattern definitions

### 3. Keyboard Input Conflicts
**Challenge**: Ink and Claude Code input processing conflicts
**Solution**:
- Adjust rawMode in session view
- Global shortcut priority management

## MVP (Minimum Viable Product) Definition

### Required Features (Within 1 week)
1. Display Git worktree list
2. Start Claude Code session
3. Session switching (Ctrl+Q)
4. Basic state display (running/waiting)

### Nice to Have (Future Extensions)
1. Session history
2. Split screen display
3. Claude Code `-r` flag integration
4. Plugin system

## Success Metrics
- Can manage 3+ Claude Code sessions simultaneously
- Session switching within 100ms
- Reasonable memory usage (under 50MB per session)
- Crash rate below 0.1%