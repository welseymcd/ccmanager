import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/projectService';
import { ProjectSessionService } from '../services/projectSessionService';
import { DatabaseManager } from '../database/manager';
import { SessionManager } from '../services/sessionManager';
import { AuthService } from '../services/auth';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { body, param, validationResult } from 'express-validator';

export function createProjectRoutes(authService: AuthService, db: DatabaseManager, sessionManager: SessionManager): Router {
  const router = Router();
  const projectService = new ProjectService(db);
  const sessionService = new ProjectSessionService(db, sessionManager);
  const authenticateToken = createAuthMiddleware(authService);

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all projects for authenticated user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const projects = await projectService.getProjects(userId);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', 
  authenticateToken,
  param('id').isString().notEmpty(),
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const project = await projectService.getProject(req.params.id, userId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(project);
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  }
);

// Create new project
router.post('/',
  authenticateToken,
  [
    body('name').isString().notEmpty().trim(),
    body('localPath').isString().notEmpty(),
    body('githubUrl').optional().isURL(),
    body('description').optional().isString(),
    body('mainCommand').optional().isString(),
    body('devServerCommand').optional().isString(),
    body('devServerPort').optional().isInt({ min: 1, max: 65535 }),
    body('workingDir').optional().isString(),
    body('tags').optional().isArray()
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const project = await projectService.createProject(userId, req.body);
      res.status(201).json(project);
    } catch (error: any) {
      console.error('Error creating project:', error);
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create project' });
      }
    }
  }
);

// Update project
router.put('/:id',
  authenticateToken,
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().notEmpty().trim(),
    body('githubUrl').optional().isURL(),
    body('description').optional().isString(),
    body('mainCommand').optional().isString(),
    body('devServerCommand').optional().isString(),
    body('devServerPort').optional().isInt({ min: 1, max: 65535 }),
    body('workingDir').optional().isString(),
    body('tags').optional().isArray()
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const project = await projectService.updateProject(req.params.id, userId, req.body);
      res.json(project);
    } catch (error: any) {
      console.error('Error updating project:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update project' });
      }
    }
  }
);

// Delete project
router.delete('/:id',
  authenticateToken,
  param('id').isString().notEmpty(),
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      await projectService.deleteProject(req.params.id, userId);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting project:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete project' });
      }
    }
  }
);

// Update project last accessed time
router.post('/:id/access',
  authenticateToken,
  param('id').isString().notEmpty(),
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      await projectService.updateLastAccessed(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating last accessed:', error);
      res.status(500).json({ error: 'Failed to update last accessed time' });
    }
  }
);

// Get project sessions
router.get('/:id/sessions',
  authenticateToken,
  param('id').isString().notEmpty(),
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessions = await sessionService.getProjectSessions(req.params.id);
      res.json(sessions);
    } catch (error) {
      console.error('Error fetching project sessions:', error);
      res.status(500).json({ error: 'Failed to fetch project sessions' });
    }
  }
);

// Create project session
router.post('/:id/sessions',
  authenticateToken,
  [
    param('id').isString().notEmpty(),
    body('sessionType').isIn(['main', 'devserver'])
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const session = await sessionService.createProjectSession(
        req.params.id,
        userId,
        req.body.sessionType
      );
      res.status(201).json(session);
    } catch (error) {
      console.error('Error creating project session:', error);
      res.status(500).json({ error: 'Failed to create project session' });
    }
  }
);

// Send command to project session
router.post('/:projectId/sessions/:sessionId/command',
  authenticateToken,
  [
    param('projectId').isString().notEmpty(),
    param('sessionId').isString().notEmpty(),
    body('command').isString().notEmpty()
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      // First check if the session exists
      if (!sessionManager.sessionExists(req.params.sessionId)) {
        return res.status(404).json({ 
          error: 'Session not found', 
          code: 'SESSION_NOT_FOUND' 
        });
      }
      
      await sessionService.sendCommand(req.params.sessionId, req.body.command);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error sending command:', error);
      
      if (error.message.includes('Session') && error.message.includes('not found')) {
        res.status(404).json({ 
          error: 'Session not found', 
          code: 'SESSION_NOT_FOUND' 
        });
      } else {
        res.status(500).json({ error: 'Failed to send command' });
      }
    }
  }
);

// Get session history
router.get('/:projectId/sessions/:sessionId/history',
  authenticateToken,
  [
    param('projectId').isString().notEmpty(),
    param('sessionId').isString().notEmpty()
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const fromLine = parseInt(req.query.fromLine as string) || 0;
      const history = await sessionService.getSessionHistory(req.params.sessionId, fromLine);
      res.json(history);
    } catch (error) {
      console.error('Error fetching session history:', error);
      res.status(500).json({ error: 'Failed to fetch session history' });
    }
  }
);

// Get dev server status
router.get('/:id/devserver',
  authenticateToken,
  param('id').isString().notEmpty(),
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      const info = await sessionService.getDevServerInfo(req.params.id);
      res.json(info);
    } catch (error) {
      console.error('Error fetching dev server info:', error);
      res.status(500).json({ error: 'Failed to fetch dev server info' });
    }
  }
);

// Update dev server status
router.post('/:id/devserver/status',
  authenticateToken,
  [
    param('id').isString().notEmpty(),
    body('status').isIn(['starting', 'running', 'stopping', 'stopped', 'error']),
    body('port').optional().isInt({ min: 1, max: 65535 }),
    body('errorMessage').optional().isString()
  ],
  validateRequest,
  async (req: AuthRequest, res: Response) => {
    try {
      await sessionService.updateDevServerStatus(
        req.params.id,
        req.body.status,
        req.body.port,
        req.body.errorMessage
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating dev server status:', error);
      res.status(500).json({ error: 'Failed to update dev server status' });
    }
  }
);

  return router;
}