# Authentication System

## Overview

CCManager Web uses a dual authentication system:
1. **Password-based authentication** with JWT tokens for user sessions
2. **API key management** for Claude API integration with encryption

## Features

### User Authentication
- Secure password hashing with bcrypt (12 rounds)
- JWT tokens for stateless authentication
- Configurable token expiry (default: 7 days)
- Password validation requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### API Key Management
- AES-256-GCM encryption for stored API keys
- Key rotation without service interruption
- Secure key hints (last 4 characters only)
- Validation against Claude API format

## API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`
Register a new user account.

**Request:**
```json
{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "userId": "user_abc123",
  "username": "john_doe",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### POST `/api/auth/login`
Authenticate and receive a JWT token.

**Request:**
```json
{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "user_abc123",
  "username": "john_doe"
}
```

#### GET `/api/auth/validate`
Validate the current JWT token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "userId": "user_abc123",
  "username": "john_doe"
}
```

#### GET `/api/auth/me`
Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "user_abc123",
  "username": "john_doe",
  "createdAt": "2024-01-01T00:00:00Z",
  "lastLogin": "2024-01-02T00:00:00Z",
  "isActive": true
}
```

#### POST `/api/auth/change-password`
Change the current user's password.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "oldPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

### API Key Routes (`/api/keys`)

All API key routes require authentication.

#### GET `/api/keys/key`
Get API key information (without revealing the key).

**Response:**
```json
{
  "hasKey": true,
  "keyHint": "6789",
  "createdAt": "2024-01-01T00:00:00Z",
  "lastUsed": "2024-01-02T00:00:00Z"
}
```

#### POST `/api/keys/key`
Store or update an API key.

**Request:**
```json
{
  "apiKey": "sk-ant-api03-..."
}
```

**Response:**
```json
{
  "success": true,
  "keyHint": "6789"
}
```

#### POST `/api/keys/key/validate`
Validate the stored API key with Claude.

**Response:**
```json
{
  "valid": true
}
```

#### DELETE `/api/keys/key`
Delete the stored API key.

**Response:**
```json
{
  "success": true
}
```

#### POST `/api/keys/key/rotate`
Start API key rotation (both keys work during rotation).

**Request:**
```json
{
  "newApiKey": "sk-ant-api03-new..."
}
```

**Response:**
```json
{
  "success": true,
  "rotationId": "rot_xyz789",
  "message": "Key rotation started. Both old and new keys will work during rotation."
}
```

#### POST `/api/keys/key/rotate/:rotationId/complete`
Complete the key rotation (old key stops working).

**Response:**
```json
{
  "success": true,
  "message": "Key rotation completed. Old key is no longer valid."
}
```

## Security Considerations

### Environment Variables
```bash
# JWT Configuration
JWT_SECRET=your-secret-key-here  # Required in production
JWT_EXPIRY=7d                     # Token expiry time

# API Key Encryption
API_KEY_ENCRYPTION_KEY=hex-string # 32-byte key as hex (64 chars)

# Database
DB_PATH=/path/to/database.db      # SQLite database location
```

### Best Practices
1. Always use HTTPS in production
2. Set strong, unique JWT_SECRET
3. Store API_KEY_ENCRYPTION_KEY securely
4. Implement rate limiting on auth endpoints
5. Monitor failed login attempts
6. Regular security audits

## Error Handling

Common error responses:

- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Invalid credentials or token
- `404 Not Found`: Resource not found
- `409 Conflict`: Username already exists
- `500 Internal Server Error`: Server error

Example error response:
```json
{
  "error": "Password must contain uppercase letter"
}
```

## Testing

Run authentication tests:
```bash
npm test -- tests/auth/authentication.test.ts
```

Run the demo:
```bash
npx ts-node examples/auth-demo.ts
```