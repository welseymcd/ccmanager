import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const validation = await authService.validateToken(token);
    
    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    req.user = {
      userId: validation.userId!,
      username: validation.username!
    };

    next();
  };
}