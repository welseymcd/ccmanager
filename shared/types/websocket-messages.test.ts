import { describe, test, expect } from 'vitest';
import { validateMessage, WebSocketMessage } from './websocket-messages';

describe('WebSocket Message Validation', () => {
  test('validates terminal_input message', () => {
    const message: WebSocketMessage = {
      type: 'terminal_input',
      sessionId: 'sess_123',
      data: 'ls -la'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('rejects message with missing required fields', () => {
    const message = {
      type: 'terminal_input',
      // missing sessionId and data
    };
    
    expect(validateMessage(message)).toBe(false);
  });

  test('validates create_session message', () => {
    const message: WebSocketMessage = {
      type: 'create_session',
      workingDir: '/home/user/project',
      command: 'claude'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('allows optional fields in create_session', () => {
    const message: WebSocketMessage = {
      type: 'create_session'
      // workingDir and command are optional
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('validates close_session message', () => {
    const message: WebSocketMessage = {
      type: 'close_session',
      sessionId: 'sess_123'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('validates resize_terminal message', () => {
    const message: WebSocketMessage = {
      type: 'resize_terminal',
      sessionId: 'sess_123',
      cols: 80,
      rows: 24
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('validates authenticate message', () => {
    const message: WebSocketMessage = {
      type: 'authenticate',
      token: 'valid-jwt-token'
    };
    
    expect(validateMessage(message)).toBe(true);
  });

  test('rejects invalid message types', () => {
    const message = {
      type: 'invalid_type',
      data: 'some data'
    };
    
    expect(validateMessage(message)).toBe(false);
  });

  test('rejects non-object messages', () => {
    expect(validateMessage(null)).toBe(false);
    expect(validateMessage(undefined)).toBe(false);
    expect(validateMessage('string')).toBe(false);
    expect(validateMessage(123)).toBe(false);
  });

  test('rejects messages without type', () => {
    const message = {
      sessionId: 'sess_123',
      data: 'ls -la'
    };
    
    expect(validateMessage(message)).toBe(false);
  });
});