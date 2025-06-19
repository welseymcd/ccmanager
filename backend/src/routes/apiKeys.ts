import { Router } from 'express';
import { ApiKeyManager } from '../services/apiKeyManager';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/auth';
import { logger } from '../utils/logger';

export function createApiKeyRoutes(authService: AuthService, apiKeyManager: ApiKeyManager): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // All routes require authentication
  router.use(authMiddleware);

  // Get API key info (without revealing the actual key)
  router.get('/key', async (req: AuthRequest, res) => {
    try {
      const storedKey = await apiKeyManager.getRawStoredKey(req.user!.userId);
      
      if (!storedKey) {
        return res.json({ hasKey: false });
      }
      
      res.json({
        hasKey: true,
        keyHint: storedKey.key_hint,
        createdAt: storedKey.created_at,
        lastUsed: storedKey.last_used
      });
    } catch (error: any) {
      logger.error('Get API key info error:', error);
      res.status(500).json({ error: 'Failed to get API key info' });
    }
  });

  // Store or update API key
  router.post('/key', async (req: AuthRequest, res) => {
    try {
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      // Validate with Claude API before storing
      const isValid = await apiKeyManager.validateWithClaude(apiKey);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid API key' });
      }

      await apiKeyManager.storeApiKey(req.user!.userId, apiKey);
      
      res.json({
        success: true,
        keyHint: apiKey.slice(-4)
      });
    } catch (error: any) {
      logger.error('Store API key error:', error);
      
      if (error.message.includes('Invalid API key format')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Failed to store API key' });
    }
  });

  // Validate API key
  router.post('/key/validate', async (req: AuthRequest, res) => {
    try {
      const isValid = await apiKeyManager.validateApiKey(req.user!.userId);
      
      res.json({ valid: isValid });
    } catch (error: any) {
      logger.error('Validate API key error:', error);
      res.status(500).json({ error: 'Failed to validate API key' });
    }
  });

  // Delete API key
  router.delete('/key', async (req: AuthRequest, res) => {
    try {
      // Use transaction to ensure clean deletion
      await apiKeyManager.transaction(() => {
        apiKeyManager.run(`DELETE FROM api_keys WHERE user_id = ?`, [req.user!.userId]);
      });
      
      logger.info(`API key deleted for user: ${req.user!.username}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Delete API key error:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  // Start key rotation
  router.post('/key/rotate', async (req: AuthRequest, res) => {
    try {
      const { newApiKey } = req.body;

      if (!newApiKey) {
        return res.status(400).json({ error: 'New API key is required' });
      }

      // Validate new key with Claude API
      const isValid = await apiKeyManager.validateWithClaude(newApiKey);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid API key' });
      }

      const rotationId = await apiKeyManager.startKeyRotation(req.user!.userId, newApiKey);
      
      res.json({
        success: true,
        rotationId,
        message: 'Key rotation started. Both old and new keys will work during rotation.'
      });
    } catch (error: any) {
      logger.error('Start key rotation error:', error);
      
      if (error.message.includes('No existing API key')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('Invalid API key format')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Failed to start key rotation' });
    }
  });

  // Complete key rotation
  router.post('/key/rotate/:rotationId/complete', async (req: AuthRequest, res) => {
    try {
      const { rotationId } = req.params;

      await apiKeyManager.completeKeyRotation(req.user!.userId, rotationId);
      
      res.json({
        success: true,
        message: 'Key rotation completed. Old key is no longer valid.'
      });
    } catch (error: any) {
      logger.error('Complete key rotation error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Failed to complete key rotation' });
    }
  });

  // Get current rotations
  router.get('/key/rotations', async (req: AuthRequest, res) => {
    try {
      const rotations = await apiKeyManager.all(`
        SELECT id, started_at, completed_at
        FROM api_key_rotations
        WHERE user_id = ?
        ORDER BY started_at DESC
        LIMIT 10
      `, [req.user!.userId]);
      
      res.json({ rotations });
    } catch (error: any) {
      logger.error('Get rotations error:', error);
      res.status(500).json({ error: 'Failed to get rotations' });
    }
  });

  return router;
}