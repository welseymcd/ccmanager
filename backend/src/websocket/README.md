# WebSocket Implementation

This directory contains the WebSocket server implementation for CCManager Web.

## Overview

The WebSocket layer provides real-time bidirectional communication between the frontend and backend, primarily for terminal session management.

## Message Protocol

### Client to Server Messages

- `authenticate`: Authenticate the socket connection with a JWT token
- `create_session`: Create a new terminal session
- `close_session`: Close an existing terminal session
- `terminal_input`: Send input to a terminal session
- `resize_terminal`: Resize a terminal session

### Server to Client Messages

- `connection_status`: Connection status updates
- `authenticated` / `authentication_error`: Authentication results
- `session_created`: Confirmation of session creation with session ID
- `session_closed`: Notification when a session is closed
- `terminal_output`: Terminal output data
- `session_error`: Error messages related to sessions

## Authentication Flow

1. Client connects to WebSocket server
2. Client receives `connection_status` message
3. Client sends `authenticate` message with JWT token
4. Server validates token and responds with `authenticated` or `authentication_error`
5. Once authenticated, client can create and manage terminal sessions

## Session Management

Each terminal session is managed by the SessionManager service which:
- Creates PTY (pseudo-terminal) instances
- Handles input/output streaming
- Manages session lifecycle
- Tracks sessions per user

## Testing

Run WebSocket tests:
```bash
npm test -- tests/websocket/
```

## Security Considerations

- All session operations require authentication
- JWT tokens are validated on each connection
- Sessions are isolated per user
- Input is passed directly to PTY without modification (be careful with untrusted input)