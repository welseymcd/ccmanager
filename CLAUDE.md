# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CCManager - Claude Code Worktree Manager

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It allows you to run Claude Code in parallel across different worktrees, switch between them seamlessly, and manage worktrees directly from the interface.

## Essential Commands

### Development
```bash
npm run dev          # Run in development mode with auto-reload
npm run build        # Build TypeScript to JavaScript
npm run lint         # Run ESLint checks
npm run typecheck    # Run TypeScript type checking
npm test             # Run all tests with Vitest
npm test -- --run    # Run tests once without watch mode
npm test -- src/services/sessionManager.test.ts  # Run specific test file
```

### Running the Application
```bash
npm start            # Run the built application
npx ccmanager        # Run directly via npx
./ccmanager          # Run the built binary (after npm run build)
```

## Architecture Overview

### Core Architecture Pattern
The application follows a React-based CLI architecture using Ink, with a clean separation between UI components and business logic services.

**Key Flow:**
1. `src/cli.tsx` validates TTY and renders the App component
2. `src/components/App.tsx` manages global state and view routing
3. Services handle business logic (sessions, worktrees, shortcuts)
4. Components render UI based on current view and state

### Service Layer

**SessionManager** (`src/services/sessionManager.ts`):
- Manages Claude Code PTY sessions with sophisticated state detection
- Events: `sessionCreated`, `sessionDestroyed`, `sessionStateChanged`, `sessionData`, `sessionExit`
- States: `idle`, `busy`, `waiting_input` (detected via prompt patterns)
- Maintains output buffers for session restoration
- Background monitoring continues even for inactive sessions

**WorktreeService** (`src/services/worktreeService.ts`):
- Wraps git worktree operations with error handling
- Integrates branch management with worktree lifecycle
- Handles main vs secondary worktree detection

**ShortcutManager** (`src/services/shortcutManager.ts`):
- Platform-aware configuration paths
- Reserved key protection (Ctrl+C, Ctrl+D, Escape)
- Converts shortcuts to terminal control codes for raw input

### Prompt Detection System

The `promptDetector.ts` module handles Claude Code's output analysis:
- Detects busy state via "ESC to interrupt" patterns
- Identifies waiting prompts ("Do you want", "Would you like", etc.)
- Tracks Claude's box-drawing UI elements (╭─╮, │, ╰─╯)
- Handles bottom border detection for prompt box completion

### Key Design Patterns

1. **View-Based Routing**: Simple state machine in App component manages navigation
2. **Event-Driven Sessions**: Decouples session monitoring from UI updates
3. **Raw PTY Passthrough**: Direct terminal control in session view
4. **Buffered Output**: Sessions maintain output history for restoration

### Testing Approach

- Uses Vitest for fast, modern testing
- Mock dependencies (e.g., `vi.mock('./promptDetector')`)
- Timer-based testing for async state transitions
- Test files alongside source files (e.g., `sessionManager.test.ts`)

## Important Considerations

### Environment Variables
- `CCMANAGER_CLAUDE_ARGS`: Additional arguments passed to Claude Code command
- `CLAUDE_COMMAND`: Override the Claude command (useful for testing)

### Platform Differences
- Config location: `~/.config/ccmanager/` (Unix) vs `%APPDATA%/ccmanager/` (Windows)
- PTY handling varies between platforms (node-pty abstracts this)

### Session Management
- Each worktree maintains its own Claude Code process
- Sessions persist when switching views (background monitoring)
- Output buffers limited to 10MB per session
- Automatic cleanup on process exit

### UI Components
All components use Ink's React-like API:
- `<Box>` for layout (flexDirection, padding, etc.)
- `<Text>` for styled text output
- `<SelectInput>` for menu navigation
- `<TextInput>` for form inputs
- Custom hooks like `useInput` for keyboard handlingRemove claude code info from commits
