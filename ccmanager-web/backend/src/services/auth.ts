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
        expiresIn: this.JWT_EXPIRY as any,
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
      SELECT id, username, password_hash, created_at, last_login, 
             COALESCE(is_active, 1) as is_active
      FROM users WHERE username = ?
    `, [username]);
    
    return user || null;
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.get(`
      SELECT id, username, password_hash, created_at, last_login,
             COALESCE(is_active, 1) as is_active
      FROM users WHERE id = ?
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