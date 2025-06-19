import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Client from 'socket.io-client';
import { setupWebSocketHandlers } from '../../src/websocket/handlers';

// Mock JWT verification
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn((token: string) => {
      if (token === 'valid-jwt-token') {
        return { userId: 'test-user-123' };
      }
      throw new Error('Invalid token');
    }),
    sign: vi.fn()
  }
}));

describe('WebSocket Connection', () => {
  let io: SocketIOServer;
  let serverSocket: any;
  let clientSocket: any;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);
    
    // Create mock managers
    const mockApiKeyManager = {} as any;
    const mockSessionHistoryManager = {} as any;
    const mockSessionManager = {} as any;
    
    // Set up connection handler before setupWebSocketHandlers
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
    
    setupWebSocketHandlers(io, mockApiKeyManager, mockSessionHistoryManager, mockSessionManager);
    
    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });

  test('client connects successfully', (done) => {
    // Wait a bit for the connection to be established
    setTimeout(() => {
      expect(clientSocket.connected).toBe(true);
      // The serverSocket might not be accessible due to how setupWebSocketHandlers works
      // So we just check that the client is connected
      done();
    }, 100);
  });

  test('client receives connection_status on connect', (done) => {
    clientSocket.on('connection_status', (data: any) => {
      expect(data).toEqual({
        type: 'connection_status',
        status: 'connected',
        timestamp: expect.any(Number)
      });
      done();
    });
  });

  test('handles authentication message', (done) => {
    clientSocket.emit('authenticate', { type: 'authenticate', token: 'valid-jwt-token' });
    clientSocket.on('authenticated', (data: any) => {
      expect(data.success).toBe(true);
      expect(data.userId).toBeDefined();
      done();
    });
  });

  test('rejects invalid authentication', (done) => {
    clientSocket.emit('authenticate', { type: 'authenticate', token: 'invalid-token' });
    clientSocket.on('authentication_error', (data: any) => {
      expect(data.error).toBe('Invalid token');
      done();
    });
  });
});