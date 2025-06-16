import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectService } from './projectService';
import { DatabaseManager } from '../database/manager';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock the database manager
vi.mock('../database/manager');
vi.mock('fs/promises');

describe('ProjectService', () => {
  let projectService: ProjectService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      transaction: vi.fn((fn: any) => fn()),
    };
    (DatabaseManager as any).mockImplementation(() => mockDb);
    projectService = new ProjectService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('UNIT-001: should_calculate_active_session_status', () => {
    it('should correctly calculate project session status', () => {
      const mockProjects = [
        {
          id: 'proj1',
          name: 'Project A',
          has_active_main_session: 1,
          has_active_dev_server: 1,
          main_session_id: 'sess1',
          dev_server_status: 'running',
        },
        {
          id: 'proj2',
          name: 'Project B',
          has_active_main_session: 1,
          has_active_dev_server: 0,
          main_session_id: 'sess2',
          dev_server_status: 'stopped',
        },
        {
          id: 'proj3',
          name: 'Project C',
          has_active_main_session: 0,
          has_active_dev_server: 0,
          main_session_id: null,
          dev_server_status: 'stopped',
        },
      ];

      const projects = projectService.mapProjectsFromDb(mockProjects);

      expect(projects[0].hasActiveMainSession).toBe(true);
      expect(projects[0].hasActiveDevSession).toBe(true);
      expect(projects[1].hasActiveMainSession).toBe(true);
      expect(projects[1].hasActiveDevSession).toBe(false);
      expect(projects[2].hasActiveMainSession).toBe(false);
      expect(projects[2].hasActiveDevSession).toBe(false);
    });

    it('should handle crashed sessions as inactive', () => {
      const mockProjects = [
        {
          id: 'proj1',
          name: 'Project A',
          has_active_main_session: 0,
          has_active_dev_server: 0,
          main_session_id: 'sess1',
          dev_server_status: 'error',
        },
      ];

      const projects = projectService.mapProjectsFromDb(mockProjects);
      expect(projects[0].hasActiveMainSession).toBe(false);
      expect(projects[0].hasActiveDevSession).toBe(false);
    });
  });

  describe('UNIT-002: should_update_last_accessed_timestamp', () => {
    it('should update project last accessed time', async () => {
      const projectId = 'proj1';
      const beforeTime = new Date();
      
      mockDb.run.mockReturnValue({ changes: 1 });
      
      await projectService.updateLastAccessed(projectId);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'UPDATE projects SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?'
      );
      expect(mockDb.run).toHaveBeenCalledWith(projectId);
    });

    it('should throw error if project not found', async () => {
      const projectId = 'nonexistent';
      mockDb.run.mockReturnValue({ changes: 0 });

      await expect(projectService.updateLastAccessed(projectId))
        .rejects.toThrow('Project not found');
    });
  });

  describe('UNIT-003: should_show_loading_state', () => {
    it('should track loading state during operations', async () => {
      let loadingState = false;
      const setLoading = (state: boolean) => { loadingState = state; };

      mockDb.all.mockImplementation(async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return [];
      });

      const promise = projectService.getProjects('user1', setLoading);
      
      // Should be loading immediately
      expect(loadingState).toBe(true);
      
      await promise;
      
      // Should not be loading after completion
      expect(loadingState).toBe(false);
    });
  });

  describe('UNIT-010: should_validate_unique_project_paths', () => {
    it('should validate unique project paths per user', async () => {
      const userId = 'user1';
      const projectPath = '/home/user/project1';

      // First check - path doesn't exist
      mockDb.get.mockReturnValueOnce(undefined);
      const isUnique1 = await projectService.isProjectPathUnique(projectPath, userId);
      expect(isUnique1).toBe(true);

      // Second check - path exists
      mockDb.get.mockReturnValueOnce({ id: 'existing-project' });
      const isUnique2 = await projectService.isProjectPathUnique(projectPath, userId);
      expect(isUnique2).toBe(false);
    });

    it('should allow same path for different users', async () => {
      const projectPath = '/home/shared/project';
      
      mockDb.get.mockReturnValueOnce(undefined);
      const isUnique1 = await projectService.isProjectPathUnique(projectPath, 'user1');
      expect(isUnique1).toBe(true);

      mockDb.get.mockReturnValueOnce(undefined);
      const isUnique2 = await projectService.isProjectPathUnique(projectPath, 'user2');
      expect(isUnique2).toBe(true);
    });
  });

  describe('UNIT-011: should_auto_detect_git_repositories', () => {
    it('should detect git repository and extract remote URL', async () => {
      const projectPath = '/home/user/project';
      
      // Mock git config file exists
      (fs.access as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(`
[remote "origin"]
  url = https://github.com/user/repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*
      `);

      const gitInfo = await projectService.detectGitRepository(projectPath);
      
      expect(gitInfo.isGitRepo).toBe(true);
      expect(gitInfo.githubUrl).toBe('https://github.com/user/repo.git');
    });

    it('should handle non-git directories', async () => {
      const projectPath = '/home/user/project';
      
      // Mock git directory doesn't exist
      (fs.access as any).mockRejectedValue(new Error('ENOENT'));

      const gitInfo = await projectService.detectGitRepository(projectPath);
      
      expect(gitInfo.isGitRepo).toBe(false);
      expect(gitInfo.githubUrl).toBeUndefined();
    });

    it('should handle SSH URLs', async () => {
      const projectPath = '/home/user/project';
      
      (fs.access as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(`
[remote "origin"]
  url = git@github.com:user/repo.git
      `);

      const gitInfo = await projectService.detectGitRepository(projectPath);
      
      expect(gitInfo.isGitRepo).toBe(true);
      expect(gitInfo.githubUrl).toBe('git@github.com:user/repo.git');
    });
  });
});