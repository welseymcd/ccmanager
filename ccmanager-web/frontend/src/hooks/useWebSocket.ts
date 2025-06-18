import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebSocketClient, WebSocketClient, WebSocketMessage, WebSocketClientOptions } from '../services/websocket';

export function useWebSocket(options: WebSocketClientOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    const client = getWebSocketClient(options);
    clientRef.current = client;

    // Set up event listeners
    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);
    const handleMessage = (message: WebSocketMessage) => setLastMessage(message);

    client.on('connected', handleConnected);
    client.on('disconnected', handleDisconnected);
    client.on('message', handleMessage);

    // Check current connection state
    setIsConnected(client.isConnected());

    // Cleanup function
    return () => {
      client.off('connected', handleConnected);
      client.off('disconnected', handleDisconnected);
      client.off('message', handleMessage);
    };
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage): Promise<any> => {
    if (clientRef.current) {
      return clientRef.current.send(message);
    }
    return Promise.reject(new Error('WebSocket client not initialized'));
  }, []);

  const sendRawMessage = useCallback((message: WebSocketMessage) => {
    if (clientRef.current) {
      clientRef.current.sendRaw(message);
    }
  }, []);

  const sendTerminalData = useCallback((sessionId: string, data: string) => {
    if (clientRef.current) {
      clientRef.current.sendTerminalData(sessionId, data);
    }
  }, []);

  const subscribeToSession = useCallback((sessionId: string) => {
    if (clientRef.current) {
      clientRef.current.subscribeToSession(sessionId);
    }
  }, []);

  const unsubscribeFromSession = useCallback((sessionId: string) => {
    if (clientRef.current) {
      clientRef.current.unsubscribeFromSession(sessionId);
    }
  }, []);

  const waitForConnection = useCallback((timeout?: number): Promise<void> => {
    if (clientRef.current) {
      return clientRef.current.waitForConnection(timeout);
    }
    return Promise.reject(new Error('WebSocket client not initialized'));
  }, []);

  // Use a getter to always return the current client
  const getClient = useCallback(() => clientRef.current, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    sendRawMessage,
    sendTerminalData,
    subscribeToSession,
    unsubscribeFromSession,
    waitForConnection,
    get client() { return clientRef.current; },
    getClient
  };
}