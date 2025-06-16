# Step 01: Dual Authentication System Implementation

## Objective
Implement password-based authentication with JWT tokens AND secure API key management for Claude integration.

## Test First: Authentication Tests

```typescript
// backend/tests/auth/authentication.test.ts
import { AuthService } from '../../src/services/auth';
import { ApiKeyManager } from '../../src/services/apiKeyManager';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

describe('Authentication Service', () => {
  let authService: AuthService;
  let apiKeyManager: ApiKeyManager;
  const testDbPath = './test-data/auth-test.db';

  beforeEach(() => {
    authService = new AuthService(testDbPath);
    apiKeyManager = new ApiKeyManager(testDbPath);
  });

  afterEach(() => {
    authService.close();
  });

  test('registers new user with hashed password', async () => {
    const result = await authService.register('testuser', 'SecurePass123!');
    
    expect(result.userId).toMatch(/^user_[a-z0-9]+$/);
    expect(result.username).toBe('testuser');
    
    // Verify password is hashed
    const user = await authService.getUser('testuser');
    expect(user?.password_hash).not.toBe('SecurePass123!');
    expect(user?.password_hash).toMatch(/^\$2[ayb]\$.{56}$/); // bcrypt format
  });

  test('prevents duplicate username registration', async () => {
    await authService.register('testuser', 'password1');
    
    await expect(authService.register('testuser', 'password2'))
      .rejects.toThrow('Username already exists');
  });

  test('validates password requirements', async () => {
    await expect(authService.register('user1', 'short'))
      .rejects.toThrow('Password must be at least 8 characters');
    
    await expect(authService.register('user2', 'nouppercase123!'))
      .rejects.toThrow('Password must contain uppercase');
    
    await expect(authService.register('user3', 'NOLOWERCASE123!'))
      .rejects.toThrow('Password must contain lowercase');
    
    await expect(authService.register('user4', 'NoNumbers!'))
      .rejects.toThrow('Password must contain number');
  });

  test('authenticates valid credentials', async () => {
    await authService.register('testuser', 'ValidPass123!');
    
    const result = await authService.authenticate('testuser', 'ValidPass123!');
    
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.userId).toBeDefined();
  });

  test('rejects invalid credentials', async () => {
    await authService.register('testuser', 'ValidPass123!');
    
    const result = await authService.authenticate('testuser', 'WrongPass123!');
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
    expect(result.token).toBeUndefined();
  });

  test('generates valid JWT token', async () => {
    await authService.register('testuser', 'ValidPass123!');
    const result = await authService.authenticate('testuser', 'ValidPass123!');
    
    const decoded = jwt.verify(result.token!, process.env.JWT_SECRET || 'test-secret');
    expect(decoded).toMatchObject({
      userId: expect.any(String),
      username: 'testuser'
    });
  });

  test('validates JWT token', async () => {
    await authService.register('testuser', 'ValidPass123!');
    const { token } = await authService.authenticate('testuser', 'ValidPass123!');
    
    const validation = await authService.validateToken(token!);
    
    expect(validation.valid).toBe(true);
    expect(validation.userId).toBeDefined();
    expect(validation.username).toBe('testuser');
  });

  test('rejects expired JWT token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user_123', username: 'test' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' }
    );
    
    const validation = await authService.validateToken(expiredToken);
    
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Token expired');
  });
});

describe('API Key Manager', () => {
  let apiKeyManager: ApiKeyManager;
  let authService: AuthService;
  const testDbPath = './test-data/apikey-test.db';

  beforeEach(async () => {
    apiKeyManager = new ApiKeyManager(testDbPath);
    authService = new AuthService(testDbPath);
    
    // Create test user
    await authService.register('testuser', 'ValidPass123!');
  });

  afterEach(() => {
    apiKeyManager.close();
  });

  test('stores API key with encryption', async () => {
    const userId = await authService.getUserId('testuser');
    const apiKey = 'sk-ant-test-key-123456789';
    
    await apiKeyManager.storeApiKey(userId!, apiKey);
    
    // Verify key is encrypted in database
    const stored = await apiKeyManager.getRawStoredKey(userId!);
    expect(stored?.encrypted_key).not.toBe(apiKey);
    expect(stored?.key_hint).toBe('6789'); // Last 4 chars
  });

  test('retrieves decrypted API key', async () => {
    const userId = await authService.getUserId('testuser');
    const apiKey = 'sk-ant-test-key-123456789';
    
    await apiKeyManager.storeApiKey(userId!, apiKey);
    const retrieved = await apiKeyManager.getApiKey(userId!);
    
    expect(retrieved).toBe(apiKey);
  });

  test('validates API key format', async () => {
    const userId = await authService.getUserId('testuser');
    
    await expect(apiKeyManager.storeApiKey(userId!, 'invalid-key'))
      .rejects.toThrow('Invalid API key format');
    
    await expect(apiKeyManager.storeApiKey(userId!, 'sk-ant-'))
      .rejects.toThrow('Invalid API key format');
  });

  test('updates existing API key', async () => {
    const userId = await authService.getUserId('testuser');
    const oldKey = 'sk-ant-old-key-123456789';
    const newKey = 'sk-ant-new-key-987654321';
    
    await apiKeyManager.storeApiKey(userId!, oldKey);
    await apiKeyManager.storeApiKey(userId!, newKey);
    
    const retrieved = await apiKeyManager.getApiKey(userId!);
    expect(retrieved).toBe(newKey);
  });

  test('validates API key with Claude API', async () => {
    const userId = await authService.getUserId('testuser');
    const apiKey = 'sk-ant-test-key-123456789';
    
    // Mock API validation
    vi.spyOn(apiKeyManager, 'validateWithClaude').mockResolvedValue(true);
    
    await apiKeyManager.storeApiKey(userId!, apiKey);
    const isValid = await apiKeyManager.validateApiKey(userId!);
    
    expect(isValid).toBe(true);
  });

  test('rotates API key without session interruption', async () => {
    const userId = await authService.getUserId('testuser');
    const oldKey = 'sk-ant-old-key-123456789';
    const newKey = 'sk-ant-new-key-987654321';
    
    await apiKeyManager.storeApiKey(userId!, oldKey);
    
    // Start rotation
    const rotationId = await apiKeyManager.startKeyRotation(userId!, newKey);
    expect(rotationId).toBeDefined();
    
    // Both keys should work during rotation
    expect(await apiKeyManager.getApiKey(userId!)).toBe(oldKey);
    expect(await apiKeyManager.getApiKey(userId!, { useRotationKey: true })).toBe(newKey);
    
    // Complete rotation
    await apiKeyManager.completeKeyRotation(userId!, rotationId);
    expect(await apiKeyManager.getApiKey(userId!)).toBe(newKey);
  });
});
```

## Implementation

### 1. Authentication Service

```typescript
// backend/src/services/auth.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { DatabaseManager } from '../database/manager';
import { generateId } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  last_login?: string;
  is_active: boolean;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  userId?: string;
  username?: string;
  error?: string;
}

export interface TokenValidation {
  valid: boolean;
  userId?: string;
  username?: string;
  error?: string;
}

export class AuthService extends DatabaseManager {
  private readonly SALT_ROUNDS = 12;
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'development-secret';
  private readonly JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

  constructor(dbPath: string) {
    super(dbPath);
  }

  async register(username: string, password: string): Promise<{ userId: string; username: string }> {
    // Validate username
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error('Username must contain only letters, numbers, hyphens, and underscores');
    }

    // Validate password
    this.validatePassword(password);

    // Check if username exists
    const existing = await this.getUser(username);
    if (existing) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    const userId = generateId('user');

    // Create user
    this.transaction(() => {
      this.run(`
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
      `, [userId, username, passwordHash]);

      // Create default preferences
      this.run(`
        INSERT INTO user_preferences (user_id)
        VALUES (?)
      `, [userId]);
    });

    logger.info(`User registered: ${username} (${userId})`);
    return { userId, username };
  }

  async authenticate(username: string, password: string): Promise<AuthResult> {
    const user = await this.getUser(username);
    
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (!user.is_active) {
      return { success: false, error: 'Account is inactive' };
    }

    // Update last login
    this.run(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    `, [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username 
      },
      this.JWT_SECRET,
      { 
        expiresIn: this.JWT_EXPIRY,
        issuer: 'ccmanager-web'
      }
    );

    logger.info(`User authenticated: ${username}`);
    
    return {
      success: true,
      token,
      userId: user.id,
      username: user.username
    };
  }

  async validateToken(token: string): Promise<TokenValidation> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'ccmanager-web'
      }) as any;

      // Check if user still exists and is active
      const user = await this.getUserById(decoded.userId);
      
      if (!user || !user.is_active) {
        return { valid: false, error: 'User not found or inactive' };
      }

      return {
        valid: true,
        userId: decoded.userId,
        username: decoded.username
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: 'Token validation failed' };
    }
  }

  async getUser(username: string): Promise<User | null> {
    const user = this.get(`
      SELECT * FROM users WHERE username = ?
    `, [username]);
    
    return user || null;
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.get(`
      SELECT * FROM users WHERE id = ?
    `, [userId]);
    
    return user || null;
  }

  async getUserId(username: string): Promise<string | null> {
    const user = await this.getUser(username);
    return user?.id || null;
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain number');
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    this.validatePassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    this.run(`
      UPDATE users SET password_hash = ? WHERE id = ?
    `, [passwordHash, userId]);

    logger.info(`Password changed for user: ${user.username}`);
  }
}
```

### 2. API Key Manager

```typescript
// backend/src/services/apiKeyManager.ts
import crypto from 'crypto';
import { DatabaseManager } from '../database/manager';
import { generateId } from '../utils/crypto';
import { logger } from '../utils/logger';

interface StoredApiKey {
  id: string;
  user_id: string;
  encrypted_key: string;
  key_hint: string;
  created_at: string;
  last_used?: string;
}

interface KeyRotation {
  id: string;
  user_id: string;
  old_key_id: string;
  new_key_id: string;
  started_at: string;
  completed_at?: string;
}

export class ApiKeyManager extends DatabaseManager {
  private readonly ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || this.generateEncryptionKey();
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor(dbPath: string) {
    super(dbPath);
    this.ensureRotationTable();
  }

  private ensureRotationTable(): void {
    this.run(`
      CREATE TABLE IF NOT EXISTS api_key_rotations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        old_key_id TEXT NOT NULL,
        new_key_id TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  async storeApiKey(userId: string, apiKey: string): Promise<void> {
    this.validateApiKeyFormat(apiKey);
    
    const encrypted = this.encrypt(apiKey);
    const keyHint = apiKey.slice(-4);
    const keyId = generateId('key');

    this.transaction(() => {
      // Delete existing key
      this.run(`DELETE FROM api_keys WHERE user_id = ?`, [userId]);
      
      // Insert new key
      this.run(`
        INSERT INTO api_keys (id, user_id, encrypted_key, key_hint)
        VALUES (?, ?, ?, ?)
      `, [keyId, userId, encrypted, keyHint]);
    });

    logger.info(`API key stored for user: ${userId}`);
  }

  async getApiKey(userId: string, options?: { useRotationKey?: boolean }): Promise<string | null> {
    let storedKey: StoredApiKey | null;

    if (options?.useRotationKey) {
      // Get rotation key if in rotation
      const rotation = this.get(`
        SELECT r.*, k.encrypted_key, k.key_hint
        FROM api_key_rotations r
        JOIN api_keys k ON k.id = r.new_key_id
        WHERE r.user_id = ? AND r.completed_at IS NULL
      `, [userId]);

      if (rotation) {
        storedKey = {
          id: rotation.new_key_id,
          user_id: userId,
          encrypted_key: rotation.encrypted_key,
          key_hint: rotation.key_hint,
          created_at: rotation.started_at
        };
      } else {
        storedKey = null;
      }
    } else {
      storedKey = this.get(`
        SELECT * FROM api_keys WHERE user_id = ?
      `, [userId]);
    }

    if (!storedKey) {
      return null;
    }

    // Update last used
    this.run(`
      UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?
    `, [storedKey.id]);

    return this.decrypt(storedKey.encrypted_key);
  }

  async getRawStoredKey(userId: string): Promise<StoredApiKey | null> {
    return this.get(`
      SELECT * FROM api_keys WHERE user_id = ?
    `, [userId]);
  }

  async validateApiKey(userId: string): Promise<boolean> {
    const apiKey = await this.getApiKey(userId);
    if (!apiKey) {
      return false;
    }

    return this.validateWithClaude(apiKey);
  }

  async validateWithClaude(apiKey: string): Promise<boolean> {
    // In real implementation, make a test API call to Claude
    // For now, just validate format
    return this.isValidApiKeyFormat(apiKey);
  }

  async startKeyRotation(userId: string, newApiKey: string): Promise<string> {
    this.validateApiKeyFormat(newApiKey);

    const oldKey = await this.getRawStoredKey(userId);
    if (!oldKey) {
      throw new Error('No existing API key to rotate');
    }

    const newKeyId = generateId('key');
    const rotationId = generateId('rot');
    const encrypted = this.encrypt(newApiKey);
    const keyHint = newApiKey.slice(-4);

    this.transaction(() => {
      // Store new key (but don't delete old one yet)
      this.run(`
        INSERT INTO api_keys (id, user_id, encrypted_key, key_hint)
        VALUES (?, ?, ?, ?)
      `, [newKeyId, userId, encrypted, keyHint]);

      // Create rotation record
      this.run(`
        INSERT INTO api_key_rotations (id, user_id, old_key_id, new_key_id)
        VALUES (?, ?, ?, ?)
      `, [rotationId, userId, oldKey.id, newKeyId]);
    });

    logger.info(`API key rotation started for user: ${userId}`);
    return rotationId;
  }

  async completeKeyRotation(userId: string, rotationId: string): Promise<void> {
    const rotation = this.get(`
      SELECT * FROM api_key_rotations
      WHERE id = ? AND user_id = ? AND completed_at IS NULL
    `, [rotationId, userId]);

    if (!rotation) {
      throw new Error('Rotation not found or already completed');
    }

    this.transaction(() => {
      // Delete old key
      this.run(`DELETE FROM api_keys WHERE id = ?`, [rotation.old_key_id]);
      
      // Mark rotation as completed
      this.run(`
        UPDATE api_key_rotations 
        SET completed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [rotationId]);
    });

    logger.info(`API key rotation completed for user: ${userId}`);
  }

  private validateApiKeyFormat(apiKey: string): void {
    if (!this.isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format');
    }
  }

  private isValidApiKeyFormat(apiKey: string): boolean {
    // Anthropic API keys start with 'sk-ant-'
    return /^sk-ant-[a-zA-Z0-9-_]{20,}$/.test(apiKey);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private generateEncryptionKey(): string {
    // In production, this should be loaded from secure storage
    logger.warn('Using generated encryption key - set API_KEY_ENCRYPTION_KEY in production');
    return crypto.randomBytes(32).toString('hex');
  }
}
```

### 3. Authentication Middleware

```typescript
// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const validation = await authService.validateToken(token);
    
    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    req.user = {
      userId: validation.userId!,
      username: validation.username!
    };

    next();
  };
}
```

## Verification

Run authentication tests:

```bash
cd backend && npm test -- tests/auth/authentication.test.ts
```

## Security Considerations

1. **Password Storage**: Using bcrypt with 12 salt rounds
2. **JWT Security**: Short-lived tokens with proper validation
3. **API Key Encryption**: AES-256-GCM with unique IVs
4. **Key Rotation**: Zero-downtime rotation support
5. **Rate Limiting**: Implement on auth endpoints

## Rollback Plan

If authentication fails:
1. Check bcrypt installation
2. Verify JWT_SECRET is set
3. Test with in-memory database
4. Implement session-based auth as fallback

## Next Step
Proceed to [02-auth-routes.md](./02-auth-routes.md) to implement authentication routes.