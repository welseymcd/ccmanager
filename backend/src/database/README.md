# Database Module

This module provides SQLite-based persistence for CCManager Web sessions and user data.

## Components

- **DatabaseManager**: Base class for database operations with schema initialization
- **SessionHistoryManager**: Extends DatabaseManager to provide session-specific operations
- **schema.sql**: SQLite schema definition with tables for users, sessions, terminal output, API keys, and preferences

## Usage

```typescript
import { SessionHistoryManager } from './database';

// Initialize database
const db = new SessionHistoryManager('./data/ccmanager.db');

// Create user
const userId = await db.createUser('username', 'hashedPassword');

// Create session
await db.createSession(sessionId, userId, '/home/user', 'claude');

// Append terminal output
await db.appendOutput(sessionId, 'Hello world\n', 'output');

// Get session history
const lines = await db.getSessionHistory(sessionId);

// Close session
await db.closeSession(sessionId, 0);

// Cleanup old sessions
await db.cleanupOldSessions(7); // Remove sessions older than 7 days
```

## Database Schema

### Tables

1. **users**: User accounts with authentication
2. **sessions**: Claude Code session records
3. **terminal_lines**: Line-by-line terminal output history
4. **api_keys**: Encrypted API key storage
5. **user_preferences**: User settings and customizations
6. **session_metadata**: Additional session state for restoration

### Features

- Foreign key constraints for data integrity
- Indexes for performance on common queries
- WAL mode for concurrent access
- Automatic timestamp tracking
- Session status management (active/closed/crashed)

## Testing

Run database tests:
```bash
npm test -- tests/database
```