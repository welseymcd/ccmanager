import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { DatabaseManager } from '../database/manager';
import { AuthService } from '../services/auth';
import { createAuthMiddleware, AuthRequest } from '../middleware/auth';
import { body, param, query, validationResult } from 'express-validator';

export function createTaskRoutes(authService: AuthService, db: DatabaseManager): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const authenticateToken = createAuthMiddleware(authService);

  // Validation middleware
  const validateRequest = (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };

  // Get tasks for a project
  router.get('/:projectId/tasks',
    authenticateToken,
    [
      param('projectId').isString().notEmpty(),
      query('includeCompleted').optional().isBoolean()
    ],
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        const includeCompleted = req.query.includeCompleted === 'true';
        const tasks = await taskService.getTasks(req.params.projectId, includeCompleted);
        res.json(tasks);
      } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
      }
    }
  );

  // Add a new task
  router.post('/:projectId/tasks',
    authenticateToken,
    [
      param('projectId').isString().notEmpty(),
      body('text').isString().notEmpty().trim(),
      body('priority').optional().isIn(['high', 'medium', 'low'])
    ],
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        const task = await taskService.addTask(req.params.projectId, req.body);
        res.status(201).json(task);
      } catch (error) {
        console.error('Error adding task:', error);
        res.status(500).json({ error: 'Failed to add task' });
      }
    }
  );

  // Update a task
  router.put('/:projectId/tasks/:taskId',
    authenticateToken,
    [
      param('projectId').isString().notEmpty(),
      param('taskId').isString().notEmpty(),
      body('text').optional().isString().notEmpty().trim(),
      body('priority').optional().isIn(['high', 'medium', 'low'])
    ],
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        const task = await taskService.updateTask(
          req.params.projectId,
          req.params.taskId,
          req.body
        );
        res.json(task);
      } catch (error: any) {
        console.error('Error updating task:', error);
        if (error.message === 'Task not found') {
          res.status(404).json({ error: 'Task not found' });
        } else {
          res.status(500).json({ error: 'Failed to update task' });
        }
      }
    }
  );

  // Toggle task completion
  router.post('/:projectId/tasks/:taskId/toggle',
    authenticateToken,
    [
      param('projectId').isString().notEmpty(),
      param('taskId').isString().notEmpty()
    ],
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        const task = await taskService.toggleTask(
          req.params.projectId,
          req.params.taskId
        );
        res.json(task);
      } catch (error: any) {
        console.error('Error toggling task:', error);
        if (error.message === 'Task not found') {
          res.status(404).json({ error: 'Task not found' });
        } else {
          res.status(500).json({ error: 'Failed to toggle task' });
        }
      }
    }
  );

  // Delete a task
  router.delete('/:projectId/tasks/:taskId',
    authenticateToken,
    [
      param('projectId').isString().notEmpty(),
      param('taskId').isString().notEmpty()
    ],
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        await taskService.deleteTask(
          req.params.projectId,
          req.params.taskId
        );
        res.status(204).send();
      } catch (error: any) {
        console.error('Error deleting task:', error);
        if (error.message === 'Task not found') {
          res.status(404).json({ error: 'Task not found' });
        } else {
          res.status(500).json({ error: 'Failed to delete task' });
        }
      }
    }
  );

  // Sync task files (cleanup)
  router.post('/:projectId/tasks/sync',
    authenticateToken,
    param('projectId').isString().notEmpty(),
    validateRequest,
    async (req: AuthRequest, res: Response) => {
      try {
        await taskService.syncTaskFiles(req.params.projectId);
        res.json({ success: true });
      } catch (error) {
        console.error('Error syncing tasks:', error);
        res.status(500).json({ error: 'Failed to sync tasks' });
      }
    }
  );

  return router;
}