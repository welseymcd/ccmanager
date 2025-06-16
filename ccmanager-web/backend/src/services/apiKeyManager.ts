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
        new_encrypted_key TEXT NOT NULL,
        new_key_hint TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, []);
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
        SELECT * FROM api_key_rotations
        WHERE user_id = ? AND completed_at IS NULL
      `, [userId]);

      if (rotation) {
        storedKey = {
          id: rotation.new_key_id,
          user_id: userId,
          encrypted_key: rotation.new_encrypted_key,
          key_hint: rotation.new_key_hint,
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
      // Create rotation record with new key data
      this.run(`
        INSERT INTO api_key_rotations (id, user_id, old_key_id, new_key_id, new_encrypted_key, new_key_hint)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [rotationId, userId, oldKey.id, newKeyId, encrypted, keyHint]);
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
      // Update the existing key with new data
      this.run(`
        UPDATE api_keys 
        SET id = ?, encrypted_key = ?, key_hint = ?
        WHERE user_id = ?
      `, [rotation.new_key_id, rotation.new_encrypted_key, rotation.new_key_hint, userId]);
      
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
    // Anthropic API keys start with 'sk-ant-' and have at least 10 chars after
    return /^sk-ant-[a-zA-Z0-9-_]{10,}$/.test(apiKey);
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