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
    
    logger.info(`[SocketAuth] New socket connection attempt from ${socket.id}`);
    logger.info(`[SocketAuth] Headers:`, socket.handshake.headers);
    logger.info(`[SocketAuth] Origin:`, socket.handshake.headers.origin);
    
    if (!token) {
      // Allow connection but mark as unauthenticated
      (socket.data as SocketData) = { authenticated: false };
      logger.info('[SocketAuth] No token provided in socket handshake - allowing unauthenticated connection');
      return next();
    }

    logger.info(`[SocketAuth] Token provided, attempting to verify...`);
    
    // Verify token
    const userId = await verifyToken(token);
    (socket.data as SocketData) = { userId, authenticated: true };
    logger.info(`[SocketAuth] Socket ${socket.id} authenticated successfully as user ${userId}`);
    next();
  } catch (error: any) {
    logger.error(`[SocketAuth] Socket authentication failed: ${error.message}`);
    logger.debug(`[SocketAuth] JWT Secret being used: ${getJwtSecret().substring(0, 10)}...`);
    logger.debug(`[SocketAuth] Full error:`, error);
    // Allow connection but mark as unauthenticated
    (socket.data as SocketData) = { authenticated: false };
    next();
  }
}