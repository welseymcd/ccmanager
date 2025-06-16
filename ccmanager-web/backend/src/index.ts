import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { setupWebSocketHandlers } from './websocket/handlers';
import { logger } from './utils/logger';
import { AuthService } from './services/auth';
import { ApiKeyManager } from './services/apiKeyManager';
import { SessionHistoryManager } from './database/sessionHistory';
import { SessionManager } from './services/sessionManager';
import { SystemMonitor } from './services/systemMonitor';
import { DatabaseManager } from './database/manager';
import { createAuthRoutes } from './routes/auth';
import { createApiKeyRoutes } from './routes/apiKeys';
import { createSessionRoutes } from './routes/sessions';
import { createMonitoringRoutes } from './routes/monitoring';
import { createProjectRoutes } from './routes/projects';
import { createTaskRoutes } from './routes/tasks';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

// Configure CORS origins
const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Same CORS logic as Express
      if (!origin) return callback(null, true);
      
      if (corsOrigins.includes(origin)) {
        callback(null, true);
      } else if (process.env.NODE_ENV === 'development' && origin.startsWith('http://') && origin.includes(':5173')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0'; // Default to 0.0.0.0 for network access
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/ccmanager.db');
const SESSION_CLEANUP_INTERVAL = parseInt(process.env.SESSION_CLEANUP_INTERVAL || '3600000'); // 1 hour default
const SESSION_RETENTION_DAYS = parseInt(process.env.SESSION_RETENTION_DAYS || '7');
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL || '60000'); // 1 minute default

// Initialize services
const databaseManager = new DatabaseManager(DB_PATH);
// AuthService extends DatabaseManager, so we don't need a separate instance
// Just use the existing database manager's connection
const authService = new AuthService(DB_PATH);
const apiKeyManager = new ApiKeyManager(DB_PATH);
const sessionHistoryManager = new SessionHistoryManager(DB_PATH);
const sessionManager = new SessionManager(apiKeyManager, sessionHistoryManager);
const systemMonitor = new SystemMonitor(sessionManager, sessionHistoryManager);

// Initialize database
async function initializeDatabase() {
  try {
    logger.info('Initializing database...');
    await sessionHistoryManager.initialize();
    
    // Clean up stale sessions from previous runs
    logger.info('Cleaning up stale sessions from previous runs...');
    const staleSessionCount = await cleanupStaleSessions();
    if (staleSessionCount > 0) {
      logger.info(`Cleaned up ${staleSessionCount} stale sessions`);
    }
    
    logger.info('Database initialized successfully');
  } catch (error: any) {
    logger.error(`Failed to initialize database: ${error.message}`);
    process.exit(1);
  }
}

// Clean up sessions that exist in database but not in SessionManager
async function cleanupStaleSessions(): Promise<number> {
  try {
    const rows = databaseManager.all('SELECT id FROM sessions WHERE status = ?', ['active']);
    let cleanedCount = 0;
    
    for (const row of rows) {
      if (!sessionManager.sessionExists(row.id)) {
        databaseManager.run('UPDATE sessions SET status = ?, exit_code = ? WHERE id = ?', 
          ['disconnected', -1, row.id]);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  } catch (error: any) {
    logger.error(`Failed to clean up stale sessions: ${error.message}`);
    return 0;
  }
}

// Periodic cleanup of old sessions
let cleanupInterval: NodeJS.Timeout;
function startSessionCleanup() {
  cleanupInterval = setInterval(async () => {
    try {
      const cleaned = await sessionHistoryManager.cleanupOldSessions(SESSION_RETENTION_DAYS);
      logger.info(`Session cleanup completed: ${cleaned} sessions removed`);
    } catch (error: any) {
      logger.error(`Session cleanup failed: ${error.message}`);
    }
  }, SESSION_CLEANUP_INTERVAL);
}

// System monitoring event handlers
function setupSystemMonitoring() {
  systemMonitor.on('anomaly', (anomaly) => {
    logger.warn('System anomaly detected:', anomaly);
  });

  systemMonitor.on('metrics', (metrics) => {
    logger.debug('System metrics collected:', {
      cpu: metrics.cpu.usage,
      memory: metrics.memory.percentage.toFixed(2),
      sessions: metrics.sessions.active
    });
  });

  systemMonitor.startMonitoring(MONITORING_INTERVAL);
}

// Graceful shutdown
async function shutdown() {
  logger.info('Starting graceful shutdown...');
  
  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Stop system monitoring
  systemMonitor.stopMonitoring();
  
  // Clear cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  // Destroy all active sessions
  sessionManager.destroyAllSessions();
  
  // Close database connections
  try {
    await sessionHistoryManager.close();
    logger.info('Database connections closed');
  } catch (error: any) {
    logger.error(`Error closing database: ${error.message}`);
  }
  
  // Exit
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (corsOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'development' && origin.startsWith('http://') && origin.includes(':5173')) {
      // In development, allow any origin on port 5173 (Vite dev server)
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbHealthy = await sessionHistoryManager.healthCheck();
    const metrics = systemMonitor.getLatestMetrics();
    
    res.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      metrics: metrics ? {
        cpu: metrics.cpu.usage,
        memory: metrics.memory.percentage.toFixed(2),
        sessions: metrics.sessions.active
      } : null
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API Routes
app.use('/api/auth', createAuthRoutes(authService));
app.use('/api/keys', createApiKeyRoutes(authService, apiKeyManager));
app.use('/api/sessions', createSessionRoutes(authService, sessionHistoryManager));
app.use('/api/monitoring', createMonitoringRoutes(authService, systemMonitor));
app.use('/api/projects', createProjectRoutes(authService, databaseManager, sessionManager));
app.use('/api/projects', createTaskRoutes(authService, databaseManager));

// Setup WebSocket handlers with database integration
setupWebSocketHandlers(io, apiKeyManager, sessionHistoryManager, sessionManager);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
async function start() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start periodic cleanup
    startSessionCleanup();
    
    // Start system monitoring
    setupSystemMonitoring();
    
    // Start HTTP server
    httpServer.listen(PORT, HOST, () => {
      logger.info(`CCManager backend server running on http://${HOST}:${PORT}`);
      console.log(`CCManager backend server running on http://${HOST}:${PORT}`);
    });
  } catch (error: any) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();