import { AuthService } from '../../src/services/auth';
import { ApiKeyManager } from '../../src/services/apiKeyManager';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

describe('Authentication Service', () => {
  let authService: AuthService;
  let apiKeyManager: ApiKeyManager;
  const testDbPath = './test-data/auth-test.db';

  beforeEach(() => {
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Remove existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    authService = new AuthService(testDbPath);
    apiKeyManager = new ApiKeyManager(testDbPath);
  });

  afterEach(() => {
    if (authService) {
      authService.close();
    }
    if (apiKeyManager) {
      apiKeyManager.close();
    }
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
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
    await authService.register('testuser', 'Password1!');
    
    await expect(authService.register('testuser', 'Password2!'))
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
    
    const decoded = jwt.verify(result.token!, process.env.JWT_SECRET || 'development-secret');
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
      process.env.JWT_SECRET || 'development-secret',
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
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Remove existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    apiKeyManager = new ApiKeyManager(testDbPath);
    authService = new AuthService(testDbPath);
    
    // Create test user
    await authService.register('testuser', 'ValidPass123!');
  });

  afterEach(() => {
    if (apiKeyManager) {
      apiKeyManager.close();
    }
    if (authService) {
      authService.close();
    }
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
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