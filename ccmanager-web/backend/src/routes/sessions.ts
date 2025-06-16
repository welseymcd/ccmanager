import { Router } from 'express';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/auth';
import { SessionHistoryManager } from '../database/sessionHistory';
import { logger } from '../utils/logger';

export function createSessionRoutes(authService: AuthService, sessionHistoryManager: SessionHistoryManager): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // All routes require authentication
  router.use(authMiddleware);

  // Get user's active sessions
  router.get('/active', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const sessions = await sessionHistoryManager.getUserActiveSessions(userId);
      
      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          workingDir: s.working_dir,
          command: s.command,
          createdAt: s.created_at,
          lastActivity: s.last_activity,
          status: s.status
        }))
      });
    } catch (error: any) {
      logger.error(`Failed to get active sessions: ${error.message}`);
      res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
  });

  // Get session history
  router.get('/:sessionId/history', async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.params;
      const { fromLine } = req.query;
      const userId = req.user!.userId;
      
      // Verify session belongs to user
      const session = await sessionHistoryManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      if (session.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const history = await sessionHistoryManager.getSessionHistory(
        sessionId,
        fromLine ? parseInt(fromLine as string) : undefined
      );
      
      res.json({
        sessionId,
        lines: history.map(line => ({
          lineNumber: line.line_number,
          content: line.content,
          type: line.type,
          timestamp: line.timestamp
        }))
      });
    } catch (error: any) {
      logger.error(`Failed to get session history: ${error.message}`);
      res.status(500).json({ error: 'Failed to retrieve session history' });
    }
  });

  // Get recent session history (last N lines)
  router.get('/:sessionId/recent', async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.params;
      const { lines = '1000' } = req.query;
      const userId = req.user!.userId;
      
      // Verify session belongs to user
      const session = await sessionHistoryManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      if (session.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const history = await sessionHistoryManager.getRecentHistory(
        sessionId,
        parseInt(lines as string)
      );
      
      res.json({
        sessionId,
        lines: history.map(line => ({
          lineNumber: line.line_number,
          content: line.content,
          type: line.type,
          timestamp: line.timestamp
        }))
      });
    } catch (error: any) {
      logger.error(`Failed to get recent history: ${error.message}`);
      res.status(500).json({ error: 'Failed to retrieve recent history' });
    }
  });

  return router;
}