import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectSessionService } from './projectSessionService';
import { SessionManager } from './sessionManager';
import { DatabaseManager } from '../database/manager';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('./sessionManager');
vi.mock('../database/manager');

describe('ProjectSessionService', () => {
  let service: ProjectSessionService;
  let mockDb: any;
  let mockSessionService: any;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    mockEventEmitter = new EventEmitter();
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      transaction: vi.fn((fn: any) => fn()),
    };
    
    mockSessionService = {
      createSession: vi.fn(),
      getSession: vi.fn(),
      writeToSession: vi.fn(),
      closeSession: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    (DatabaseManager as any).mockImplementation(() => mockDb);
    (SessionManager as any).mockImplementation(() => mockSessionService);
    
    service = new ProjectSessionService(mockDb, mockSessionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('UNIT-004: should_format_claude_output_for_display', () => {
    it('should strip ANSI codes from terminal output', () => {
      const rawOutput = '\x1b[31mError:\x1b[0m Something went wrong\x1b[2K\x1b[1G';
      const formatted = service.formatTerminalOutput(rawOutput);
      
      expect(formatted).toBe('Error: Something went wrong');
      expect(formatted).not.toContain('\x1b');
    });

    it('should preserve line breaks', () => {
      const rawOutput = 'Line 1\nLine 2\r\nLine 3';
      const formatted = service.formatTerminalOutput(rawOutput);
      
      expect(formatted).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should convert box drawing characters to simple borders', () => {
      const rawOutput = '╭─────╮\n│Hello│\n╰─────╯';
      const formatted = service.formatTerminalOutput(rawOutput);
      
      expect(formatted).toBe('+-----+\n|Hello|\n+-----+');
    });

    it('should handle incomplete ANSI sequences', () => {
      const rawOutput = 'Normal text\x1b[3';
      const formatted = service.formatTerminalOutput(rawOutput);
      
      expect(formatted).toBe('Normal text');
    });

    it('should preserve code block formatting', () => {
      const rawOutput = '```javascript\nfunction hello() {\n  console.log("Hi");\n}\n```';
      const formatted = service.formatTerminalOutput(rawOutput);
      
      expect(formatted).toBe('```javascript\nfunction hello() {\n  console.log("Hi");\n}\n```');
    });

    it('should handle very long lines with wrapping', () => {
      const longLine = 'A'.repeat(200);
      const formatted = service.formatTerminalOutput(longLine);
      
      // Should wrap at 120 characters for mobile
      expect(formatted.split('\n').length).toBeGreaterThan(1);
      expect(formatted.split('\n')[0].length).toBeLessThanOrEqual(120);
    });
  });

  describe('UNIT-005: should_show_session_connection_status', () => {
    it('should track session connection states', async () => {
      const projectId = 'proj1';
      const sessionId = 'sess1';
      
      // Mock the project exists
      mockDb.get.mockReturnValue({
        id: projectId,
        working_dir: '/home/user/project1',
        main_command: 'claude'
      });
      
      mockSessionService.createSession.mockResolvedValue(sessionId);
      mockSessionService.getSession.mockReturnValue({
        id: sessionId,
        status: 'active'
      });

      const session = await service.createProjectSession(projectId, 'user1', 'main');
      
      expect(service.getSessionStatus(sessionId)).toBe('connecting');
      
      // Wait for the setTimeout to mark as connected
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(service.getSessionStatus(sessionId)).toBe('connected');
      
      // Simulate disconnection
      service.updateSessionStatus(sessionId, 'disconnected');
      expect(service.getSessionStatus(sessionId)).toBe('disconnected');
    });

    it('should handle connection errors', async () => {
      const projectId = 'proj1';
      
      // Mock the project exists
      mockDb.get.mockReturnValue({
        id: projectId,
        working_dir: '/home/user/project1',
        main_command: 'claude'
      });
      
      mockSessionService.createSession.mockRejectedValue(new Error('Connection failed'));
      
      await expect(service.createProjectSession(projectId, 'user1', 'main'))
        .rejects.toThrow('Connection failed');
    });
  });

  describe('UNIT-008: should_view_dev_server_output', () => {
    it('should format dev server output for display', () => {
      const outputs = [
        { content: '> my-app@1.0.0 dev', type: 'stdout' },
        { content: '> vite', type: 'stdout' },
        { content: '', type: 'stdout' },
        { content: '  VITE v4.0.0  ready in 523 ms', type: 'stdout' },
        { content: '', type: 'stdout' },
        { content: '  ➜  Local:   http://localhost:5173/', type: 'stdout' },
        { content: '  ➜  Network: http://192.168.1.100:5173/', type: 'stdout' },
        { content: '[vite] page reload', type: 'stdout' },
        { content: 'Error: Module not found', type: 'stderr' }
      ];

      const formatted = service.formatDevServerOutput(outputs);
      
      expect(formatted).toContain('my-app@1.0.0 dev');
      expect(formatted).toContain('VITE v4.0.0');
      expect(formatted).toContain('Local:   http://localhost:5173/');
      expect(formatted).toContain('[ERROR] Error: Module not found');
      expect(formatted.split('\n').filter(l => l.trim() === '').length).toBeLessThan(3);
    });

    it('should highlight URLs in dev server output', () => {
      const outputs = [
        { content: 'Server running at http://localhost:3000', type: 'stdout' }
      ];

      const formatted = service.formatDevServerOutput(outputs);
      const highlighted = service.highlightUrls(formatted);
      
      expect(highlighted).toContain('<a href="http://localhost:3000"');
    });
  });

  describe('UNIT-009: should_show_server_running_status', () => {
    it('should track dev server status transitions', async () => {
      const projectId = 'proj1';
      
      // Initial state
      expect(await service.getDevServerStatus(projectId)).toBe('stopped');
      
      // Starting
      await service.updateDevServerStatus(projectId, 'starting');
      expect(await service.getDevServerStatus(projectId)).toBe('starting');
      
      // Running
      await service.updateDevServerStatus(projectId, 'running', 3000);
      const status = await service.getDevServerStatus(projectId);
      expect(status).toBe('running');
      
      // Verify port is saved
      mockDb.get.mockReturnValue({ status: 'running', port: 3000 });
      const serverInfo = await service.getDevServerInfo(projectId);
      expect(serverInfo.port).toBe(3000);
      
      // Stopping
      await service.updateDevServerStatus(projectId, 'stopping');
      expect(await service.getDevServerStatus(projectId)).toBe('stopping');
      
      // Stopped
      await service.updateDevServerStatus(projectId, 'stopped');
      expect(await service.getDevServerStatus(projectId)).toBe('stopped');
    });

    it('should handle dev server errors', async () => {
      const projectId = 'proj1';
      
      await service.updateDevServerStatus(projectId, 'error', undefined, 'Port already in use');
      
      mockDb.get.mockReturnValue({ 
        status: 'error', 
        error_message: 'Port already in use' 
      });
      
      const serverInfo = await service.getDevServerInfo(projectId);
      expect(serverInfo.status).toBe('error');
      expect(serverInfo.errorMessage).toBe('Port already in use');
    });
  });

  describe('INT-002: should_restore_last_active_session_view', () => {
    it('should restore session history when switching tabs', async () => {
      const sessionId = 'sess1';
      const mockHistory = [
        { lineNumber: 1, content: 'Welcome to Claude', type: 'output', timestamp: new Date().toISOString() },
        { lineNumber: 2, content: 'How can I help?', type: 'output', timestamp: new Date().toISOString() },
        { lineNumber: 3, content: 'explain react hooks', type: 'input', timestamp: new Date().toISOString() },
        { lineNumber: 4, content: 'React hooks are...', type: 'output', timestamp: new Date().toISOString() }
      ];

      mockDb.all.mockReturnValue(mockHistory);

      const history = await service.getSessionHistory(sessionId, 0);
      
      expect(history).toHaveLength(4);
      expect(history[0].content).toBe('Welcome to Claude');
      expect(history[2].type).toBe('input');
    });

    it('should paginate session history', async () => {
      const sessionId = 'sess1';
      const mockHistory = Array.from({ length: 50 }, (_, i) => ({
        lineNumber: i + 21,
        content: `Line ${i + 21}`,
        type: 'output'
      }));

      mockDb.all.mockReturnValue(mockHistory);

      const history = await service.getSessionHistory(sessionId, 20);
      
      expect(history).toHaveLength(50);
      expect(history[0].lineNumber).toBe(21);
    });
  });

  describe('INT-004: should_preserve_session_history_when_switching', () => {
    it('should save session output to database', async () => {
      const sessionId = 'sess1';
      const output = 'New output from Claude';
      
      await service.saveSessionOutput(sessionId, output, 'output');
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO terminal_lines')
      );
      expect(mockDb.run).toHaveBeenCalledWith(sessionId, expect.any(Number), output, 'output');
    });

    it('should handle concurrent output saves', async () => {
      const sessionId = 'sess1';
      const outputs = ['Output 1', 'Output 2', 'Output 3'];
      
      await Promise.all(
        outputs.map(output => service.saveSessionOutput(sessionId, output, 'output'))
      );
      
      expect(mockDb.run).toHaveBeenCalledTimes(3);
    });
  });
});