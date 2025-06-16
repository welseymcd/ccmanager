# CCManager Web

Web interface for CCManager - Claude Code Worktree Manager

## Project Structure

```
ccmanager-web/
├── backend/          # Express.js backend with Socket.IO
├── frontend/         # React frontend with Vite
├── shared/           # Shared TypeScript types
├── data/             # SQLite database storage
├── logs/             # Application logs
└── scripts/          # Utility scripts
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm run dev` - Start both backend and frontend in development mode
- `npm run build` - Build all workspaces for production
- `npm test` - Run all tests
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## Workspaces

This project uses npm workspaces for monorepo management:
- `@ccmanager/backend` - Express.js API server
- `@ccmanager/frontend` - React web application
- `@ccmanager/shared` - Shared TypeScript types and utilities