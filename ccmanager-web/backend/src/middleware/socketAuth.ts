import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface SocketData {
  userId?: string;
  authenticated: boolean;
}

// Get JWT_SECRET from environment - it should be loaded by dotenv in index.ts
const getJwtSecret = () => process.env.JWT_SECRET || 'development-secret';

export async function verifyToken(token: string): Promise<string> {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    return decoded.userId;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export async function authenticateSocket(socket: Socket, next: (err?: any) => void) {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      // Allow connection but mark as unauthenticated
      (socket.data as SocketData) = { authenticated: false };
      logger.debug('No token provided in socket handshake');
      return next();
    }

    // Verify token
    const userId = await verifyToken(token);
    (socket.data as SocketData) = { userId, authenticated: true };
    logger.info(`Socket ${socket.id} authenticated as user ${userId}`);
    next();
  } catch (error: any) {
    logger.error(`Socket authentication failed: ${error.message}`);
    logger.debug(`JWT Secret being used: ${getJwtSecret().substring(0, 10)}...`);
    // Allow connection but mark as unauthenticated
    (socket.data as SocketData) = { authenticated: false };
    next();
  }
}