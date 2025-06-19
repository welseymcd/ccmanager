import { DatabaseManager } from '../database/manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface Project {
  id: string;
  name: string;
  localPath: string;
  githubUrl?: string;
  description?: string;
  mainCommand?: string;
  devServerCommand?: string;
  devServerPort?: number;
  workingDir: string;
  createdAt: string;
  lastAccessedAt: string;
  tags?: string[];
  userId: string;
  
  // Computed from database view
  hasActiveMainSession: boolean;
  hasActiveDevSession: boolean;
  mainSessionId?: string;
  devServerStatus?: string;
  totalTasks: number;
  completedTasks: number;
}

export interface ProjectInput {
  name: string;
  localPath: string;
  githubUrl?: string;
  description?: string;
  mainCommand?: string;
  devServerCommand?: string;
  devServerPort?: number;
  workingDir?: string;
  tags?: string[];
}

export interface GitInfo {
  isGitRepo: boolean;
  githubUrl?: string;
}

export class ProjectService {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Get all projects for a user with session status
   */
  async getProjects(userId: string, setLoading?: (state: boolean) => void): Promise<Project[]> {
    if (setLoading) setLoading(true);
    
    try {
      const rows = this.db.all(`
        SELECT 
          p.*,
          pd.has_active_main_session,
          pd.has_active_dev_server,
          pd.main_session_id,
          pd.dev_server_port,
          pd.dev_server_status,
          pd.total_tasks,
          pd.completed_tasks
        FROM projects p
        JOIN project_dashboard pd ON p.id = pd.id
        WHERE p.user_id = ?
        ORDER BY p.last_accessed_at DESC
      `, userId);
      
      return this.mapProjectsFromDb(rows);
    } finally {
      if (setLoading) setLoading(false);
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string, userId: string): Promise<Project | null> {
    const row = this.db.get(`
      SELECT 
        p.*,
        pd.has_active_main_session,
        pd.has_active_dev_server,
        pd.main_session_id,
        pd.dev_server_port,
        pd.dev_server_status,
        pd.total_tasks,
        pd.completed_tasks
      FROM projects p
      JOIN project_dashboard pd ON p.id = pd.id
      WHERE p.id = ? AND p.user_id = ?
    `, [projectId, userId]);
    
    if (!row) return null;
    
    return this.mapProjectFromDb(row);
  }

  /**
   * Create a new project
   */
  async createProject(userId: string, input: ProjectInput): Promise<Project> {
    // Validate unique path
    const isUnique = await this.isProjectPathUnique(input.localPath, userId);
    if (!isUnique) {
      throw new Error('A project with this path already exists');
    }

    // Auto-detect git repository if not provided
    if (!input.githubUrl) {
      const gitInfo = await this.detectGitRepository(input.localPath);
      if (gitInfo.isGitRepo && gitInfo.githubUrl) {
        input.githubUrl = gitInfo.githubUrl;
      }
    }

    const projectId = randomBytes(16).toString('hex').toLowerCase();
    const workingDir = input.workingDir || input.localPath;
    const tags = input.tags ? JSON.stringify(input.tags) : null;

    this.db.run(`
      INSERT INTO projects (
        id, name, local_path, github_url, description,
        main_command, dev_server_command, dev_server_port,
        working_dir, tags, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projectId,
      input.name,
      input.localPath,
      input.githubUrl || null,
      input.description || null,
      input.mainCommand || 'ccmanager',
      input.devServerCommand || null,
      input.devServerPort || null,
      workingDir,
      tags,
      userId
    ]);

    // Create project tasks directory
    await this.createProjectTasksDirectory(projectId);

    const project = await this.getProject(projectId, userId);
    if (!project) throw new Error('Failed to create project');
    return project;
  }

  /**
   * Update a project
   */
  async updateProject(projectId: string, userId: string, updates: Partial<ProjectInput>): Promise<Project> {
    const allowedFields = [
      'name', 'github_url', 'description', 'main_command',
      'dev_server_command', 'dev_server_port', 'working_dir', 'tags'
    ];

    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = ?`);
        if (key === 'tags' && Array.isArray(value)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(projectId, userId);

    const result = this.db.run(`
      UPDATE projects 
      SET ${setClause.join(', ')}
      WHERE id = ? AND user_id = ?
    `, values);

    if (result.changes === 0) {
      throw new Error('Project not found or unauthorized');
    }

    const project = await this.getProject(projectId, userId);
    if (!project) throw new Error('Failed to update project');
    return project;
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const result = this.db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
    
    if (result.changes === 0) {
      throw new Error('Project not found or unauthorized');
    }

    // Clean up tasks directory
    await this.deleteProjectTasksDirectory(projectId);
  }

  /**
   * Update project last accessed timestamp
   */
  async updateLastAccessed(projectId: string): Promise<void> {
    const result = this.db.run(
      'UPDATE projects SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
      projectId
    );
    
    if (result.changes === 0) {
      throw new Error('Project not found');
    }
  }

  /**
   * Check if project path is unique for user
   */
  async isProjectPathUnique(projectPath: string, userId: string): Promise<boolean> {
    const existing = this.db.get(
      'SELECT id FROM projects WHERE local_path = ? AND user_id = ?',
      [projectPath, userId]
    );
    return !existing;
  }

  /**
   * Detect if directory is a git repository
   */
  async detectGitRepository(projectPath: string): Promise<GitInfo> {
    try {
      const gitConfigPath = path.join(projectPath, '.git', 'config');
      await fs.access(gitConfigPath);
      
      const configContent = await fs.readFile(gitConfigPath, 'utf-8');
      const urlMatch = configContent.match(/url\s*=\s*(.+)/);
      
      if (urlMatch && urlMatch[1]) {
        return {
          isGitRepo: true,
          githubUrl: urlMatch[1].trim()
        };
      }
      
      return { isGitRepo: true };
    } catch {
      return { isGitRepo: false };
    }
  }

  /**
   * Map database rows to Project objects
   */
  mapProjectsFromDb(rows: any[]): Project[] {
    return rows.map(row => this.mapProjectFromDb(row));
  }

  /**
   * Map single database row to Project object
   */
  private mapProjectFromDb(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      localPath: row.local_path,
      githubUrl: row.github_url,
      description: row.description,
      mainCommand: row.main_command,
      devServerCommand: row.dev_server_command,
      devServerPort: row.dev_server_port,
      workingDir: row.working_dir,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      tags: row.tags ? JSON.parse(row.tags) : [],
      userId: row.user_id,
      hasActiveMainSession: Boolean(row.has_active_main_session),
      hasActiveDevSession: Boolean(row.has_active_dev_server),
      mainSessionId: row.main_session_id,
      devServerStatus: row.dev_server_status,
      totalTasks: row.total_tasks || 0,
      completedTasks: row.completed_tasks || 0
    };
  }

  /**
   * Create project tasks directory
   */
  private async createProjectTasksDirectory(projectId: string): Promise<void> {
    const tasksDir = this.getProjectTasksPath(projectId);
    await fs.mkdir(tasksDir, { recursive: true });
    
    // Create initial task files
    const currentTasksPath = path.join(tasksDir, 'current-tasks.md');
    const completedTasksPath = path.join(tasksDir, 'completed-tasks.md');
    const notesPath = path.join(tasksDir, 'project-notes.md');
    
    await fs.writeFile(currentTasksPath, '# Current Tasks\n\n');
    await fs.writeFile(completedTasksPath, '# Completed Tasks\n\n');
    await fs.writeFile(notesPath, '# Project Notes\n\n');
  }

  /**
   * Delete project tasks directory
   */
  private async deleteProjectTasksDirectory(projectId: string): Promise<void> {
    const tasksDir = this.getProjectTasksPath(projectId);
    try {
      await fs.rm(tasksDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete tasks directory for project ${projectId}:`, error);
    }
  }

  /**
   * Get project tasks directory path
   */
  private getProjectTasksPath(projectId: string): string {
    return path.join(process.env.HOME || '', '.ccmanager', 'tasks', projectId);
  }
}