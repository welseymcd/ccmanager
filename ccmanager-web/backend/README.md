# CCManager Backend

The backend server for CCManager Web, providing API endpoints, WebSocket connections, and session management for the Claude Code manager.

## Architecture Overview

### Core Components

1. **Session Management** (`services/sessionManager.ts`)
   - Manages PTY sessions for Claude Code instances
   - Integrates with database for session history
   - Handles session lifecycle (create, write, resize, destroy)
   - Maintains session buffers for reconnection

2. **Database Layer** (`database/`)
   - SQLite database with better-sqlite3
   - Session history tracking
   - User management and authentication
   - API key storage

3. **WebSocket Communication** (`websocket/handlers.ts`)
   - Real-time terminal I/O
   - Session management commands
   - Authentication via JWT tokens

4. **System Monitoring** (`services/systemMonitor.ts`)
   - CPU and memory usage tracking
   - Active session monitoring
   - Database health checks
   - Anomaly detection

5. **Authentication & Security**
   - JWT-based authentication
   - Bcrypt password hashing
   - API key management with secure storage
   - Role-based access control

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and receive JWT
- `POST /api/auth/logout` - Logout (invalidate token)
- `GET /api/auth/me` - Get current user info

### API Keys (`/api/keys`)
- `GET /api/keys` - List user's API keys
- `POST /api/keys` - Create new API key
- `PUT /api/keys/:id` - Update API key (set/update value)
- `DELETE /api/keys/:id` - Delete API key

### Sessions (`/api/sessions`)
- `GET /api/sessions/active` - Get user's active sessions
- `GET /api/sessions/:id/history` - Get session terminal history
- `GET /api/sessions/:id/recent` - Get recent terminal output

### Monitoring (`/api/monitoring`)
- `GET /api/monitoring/metrics` - Current system metrics
- `GET /api/monitoring/metrics/history` - Metrics history
- `GET /api/monitoring/metrics/average` - Average metrics over time

### Health Check
- `GET /health` - Server health status

## WebSocket Events

### Client to Server
- `authenticate` - Authenticate with JWT
- `create_session` - Create new PTY session
- `terminal_input` - Send input to terminal
- `resize_terminal` - Resize terminal dimensions
- `close_session` - Close PTY session
- `list_sessions` - List user's sessions
- `get_session_info` - Get session details
- `get_session_buffer` - Get session output buffer

### Server to Client
- `connection_status` - Connection established
- `authenticated` - Authentication successful
- `session_created` - Session created successfully
- `terminal_output` - Terminal output data
- `session_closed` - Session closed
- `session_error` - Session-related error
- `sessions_list` - List of sessions
- `session_info` - Session details
- `session_buffer` - Session output buffer

## Environment Variables

See `.env.example` for all configuration options:

```env
# Server
PORT=3001
NODE_ENV=development

# Security
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Database
DB_PATH=../data/ccmanager.db

# Session Management
SESSION_CLEANUP_INTERVAL=3600000
SESSION_RETENTION_DAYS=7
MAX_SESSIONS_PER_USER=20

# Monitoring
MONITORING_INTERVAL=60000
```

## Database Schema

The SQLite database includes:
- `users` - User accounts
- `user_preferences` - User settings
- `api_keys` - Encrypted API keys
- `sessions` - Session records
- `terminal_lines` - Terminal output history
- `session_metadata` - Additional session data

## Security Features

1. **Authentication**
   - JWT tokens with configurable expiration
   - Bcrypt password hashing with salt rounds
   - Secure session management

2. **API Key Security**
   - Keys encrypted at rest
   - Only hints stored in plaintext
   - Secure key generation

3. **Session Isolation**
   - Users can only access their own sessions
   - Session buffers cleared on timeout
   - Proper process cleanup

4. **Error Handling**
   - Comprehensive error middleware
   - Structured error responses
   - Detailed logging

## Development

### Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Running
```bash
# Development with auto-reload
npm run dev

# Production build
npm run build
npm start

# Or use the startup script
../scripts/start-backend.sh
```

### Testing
```bash
npm test
npm run test:watch
npm run test:coverage
```

## Monitoring & Maintenance

### System Monitoring
The backend includes built-in system monitoring that tracks:
- CPU usage and load averages
- Memory usage
- Active session counts
- Database health

Access metrics via the `/api/monitoring` endpoints.

### Session Cleanup
Old sessions are automatically cleaned up based on:
- `SESSION_CLEANUP_INTERVAL` - How often cleanup runs
- `SESSION_RETENTION_DAYS` - How long to keep closed sessions

### Logging
Logs are written to:
- `../logs/combined.log` - All logs
- `../logs/error.log` - Error logs only
- Console output in development mode

### Graceful Shutdown
The server handles SIGTERM and SIGINT signals for graceful shutdown:
1. Stops accepting new connections
2. Closes all active sessions
3. Saves pending data
4. Closes database connections

## Troubleshooting

### Common Issues

1. **Database locked errors**
   - Ensure only one instance is running
   - Check file permissions on database

2. **Session creation fails**
   - Verify Claude CLI is installed
   - Check API key configuration
   - Ensure sufficient permissions for PTY

3. **High memory usage**
   - Adjust `MAX_BUFFER_SIZE` in SessionManager
   - Reduce `SESSION_RETENTION_DAYS`
   - Check for orphaned processes

### Debug Mode
Set `LOG_LEVEL=debug` for verbose logging.

## Architecture Decisions

1. **SQLite Database**
   - Simple deployment
   - No external dependencies
   - Sufficient for single-server deployment

2. **PTY Sessions**
   - Direct terminal emulation
   - Full Claude CLI compatibility
   - Preserves ANSI colors and formatting

3. **WebSocket Communication**
   - Real-time terminal I/O
   - Efficient for streaming data
   - Supports reconnection

4. **Session Buffering**
   - Enables session restoration
   - Limited buffer size prevents memory issues
   - Automatic trimming of old data