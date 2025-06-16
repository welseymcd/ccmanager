import { Router } from 'express';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/auth';
import { SystemMonitor } from '../services/systemMonitor';
import { logger } from '../utils/logger';

export function createMonitoringRoutes(authService: AuthService, systemMonitor: SystemMonitor): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // All monitoring routes require authentication
  router.use(authMiddleware);

  // Get current system metrics
  router.get('/metrics', (req, res) => {
    try {
      const metrics = systemMonitor.getLatestMetrics();
      
      if (!metrics) {
        return res.status(503).json({ 
          error: 'Metrics not yet available',
          message: 'System monitoring is still initializing'
        });
      }

      res.json({
        timestamp: metrics.timestamp,
        cpu: {
          usage: metrics.cpu.usage,
          loadAverage: metrics.cpu.loadAverage
        },
        memory: {
          total: metrics.memory.total,
          used: metrics.memory.used,
          free: metrics.memory.free,
          percentage: metrics.memory.percentage.toFixed(2)
        },
        sessions: {
          active: metrics.sessions.active,
          byUser: Array.from(metrics.sessions.byUser.entries()).map(([userId, count]) => ({
            userId,
            count
          }))
        },
        database: metrics.database
      });
    } catch (error: any) {
      logger.error(`Failed to get metrics: ${error.message}`);
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  // Get metrics history
  router.get('/metrics/history', (req, res) => {
    try {
      const history = systemMonitor.getMetricsHistory();
      
      res.json({
        count: history.length,
        metrics: history.map(m => ({
          timestamp: m.timestamp,
          cpu: m.cpu.usage,
          memory: m.memory.percentage.toFixed(2),
          sessions: m.sessions.active
        }))
      });
    } catch (error: any) {
      logger.error(`Failed to get metrics history: ${error.message}`);
      res.status(500).json({ error: 'Failed to retrieve metrics history' });
    }
  });

  // Get average metrics over time period
  router.get('/metrics/average', (req, res) => {
    try {
      const { minutes = '5' } = req.query;
      const avgMetrics = systemMonitor.getAverageMetrics(parseInt(minutes as string));
      
      if (!avgMetrics) {
        return res.status(503).json({ 
          error: 'Insufficient data',
          message: 'Not enough metrics collected for averaging'
        });
      }

      res.json({
        period: `${minutes} minutes`,
        cpu: avgMetrics.cpu ? {
          usage: avgMetrics.cpu.usage.toFixed(2),
          loadAverage: avgMetrics.cpu.loadAverage
        } : null,
        memory: avgMetrics.memory ? {
          percentage: avgMetrics.memory.percentage.toFixed(2),
          used: avgMetrics.memory.used,
          free: avgMetrics.memory.free
        } : null,
        sessions: avgMetrics.sessions ? {
          average: avgMetrics.sessions.active
        } : null
      });
    } catch (error: any) {
      logger.error(`Failed to get average metrics: ${error.message}`);
      res.status(500).json({ error: 'Failed to calculate average metrics' });
    }
  });

  return router;
}