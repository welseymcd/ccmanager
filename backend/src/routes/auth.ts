import { Router } from 'express';
import { AuthService } from '../services/auth';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // Register new user
  router.post('/register', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const result = await authService.register(username, password);
      
      // Auto-login after registration
      const authResult = await authService.authenticate(username, password);
      
      res.status(201).json({
        userId: result.userId,
        username: result.username,
        token: authResult.token
      });
    } catch (error: any) {
      logger.error('Registration error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      
      if (error.message.includes('must')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const result = await authService.authenticate(username, password);
      
      if (!result.success) {
        return res.status(401).json({ error: result.error });
      }
      
      res.json({
        token: result.token,
        userId: result.userId,
        username: result.username
      });
    } catch (error: any) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Validate token
  router.get('/validate', authMiddleware, async (req: AuthRequest, res) => {
    res.json({
      valid: true,
      userId: req.user!.userId,
      username: req.user!.username
    });
  });

  // Get current user
  router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await authService.getUserById(req.user!.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        isActive: user.is_active
      });
    } catch (error: any) {
      logger.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Change password
  router.post('/change-password', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Old and new passwords are required' });
      }

      await authService.changePassword(req.user!.userId, oldPassword, newPassword);
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Change password error:', error);
      
      if (error.message.includes('Invalid current password')) {
        return res.status(401).json({ error: error.message });
      }
      
      if (error.message.includes('must')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Logout (client-side token removal, but we can track it)
  router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
    logger.info(`User logged out: ${req.user!.username}`);
    res.json({ success: true });
  });

  return router;
}