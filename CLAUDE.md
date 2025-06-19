# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CCManager Web - Web Interface for Claude Code

CCManager Web is a web-based interface for developing with Claude Code in a browser. It provides project management, terminal sessions, and file exploration capabilities through a modern React frontend and Node.js backend.

## Essential Commands

### Development
```bash
npm run dev          # Run both backend and frontend in development mode
npm run dev:backend  # Run backend only
npm run dev:frontend # Run frontend only
npm run build        # Build all packages (shared, backend, frontend)
npm run test         # Run all tests
npm run lint         # Run ESLint checks
npm run typecheck    # Run TypeScript type checking
```

### Setup
```bash
npm install          # Install all dependencies for workspaces
./setup-admin.sh     # Set up admin user (interactive)
```

## Architecture Overview

### Monorepo Structure
The application uses npm workspaces with three packages:
- `backend/` - Node.js server with Express, WebSocket, and SQLite
- `frontend/` - React SPA with Vite, TanStack Router, and Tailwind CSS
- `shared/` - Shared TypeScript types and utilities

### Backend Architecture

**Core Services:**
- **SessionManager** (`backend/src/services/sessionManager.ts`): Manages tmux sessions for Claude Code
- **ProjectService** (`backend/src/services/projectService.ts`): Handles project CRUD operations
- **AuthService** (`backend/src/services/auth.ts`): JWT-based authentication
- **WebSocket Handlers** (`backend/src/websocket/handlers.ts`): Real-time terminal communication

**Database Schema:**
- Users with bcrypt-hashed passwords
- Projects with descriptions and paths
- API keys for authentication
- Session history tracking

### Frontend Architecture

**Key Components:**
- **ProjectDashboard**: Main view showing all projects
- **ProjectPage**: Individual project view with terminal and file explorer
- **TerminalView**: XTerm.js-based terminal emulator
- **FileExplorer**: Tree-based file navigation

**State Management:**
- Zustand stores for projects, sessions, tabs, and UI state
- TanStack Query for server state
- WebSocket connection for real-time updates

### Authentication Flow
1. Login with username/password → JWT token
2. Token stored in localStorage
3. All API requests include Authorization header
4. WebSocket authenticated via token in connection params

### Terminal Session Management
- Uses tmux for persistent terminal sessions
- Each project can have multiple terminal tabs
- Sessions persist across browser refreshes
- Real-time terminal data via WebSocket

## Development Guidelines

### Adding New Features
1. Define types in `shared/types/`
2. Implement backend logic in appropriate service
3. Add API routes in `backend/src/routes/`
4. Create frontend components in `frontend/src/components/`
5. Update stores if needed in `frontend/src/stores/`

### Testing
- Backend: Vitest with SQLite in-memory databases
- Frontend: Vitest with React Testing Library
- Run specific test: `npm test -- <filename>`

### Environment Variables
Backend `.env`:
```
PORT=3001
JWT_SECRET=your-secret-key
NODE_ENV=development
```

Frontend uses Vite's env system with `VITE_` prefix.
