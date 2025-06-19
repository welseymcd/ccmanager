import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseManager } from '../database/manager';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
  createdAt: string;
  completedAt?: string;
}

export interface TaskInput {
  text: string;
  priority?: 'high' | 'medium' | 'low';
}

export class TaskService {
  private db: DatabaseManager | null;

  constructor(db?: DatabaseManager) {
    this.db = db || null;
  }

  /**
   * Get all tasks for a project
   */
  async getTasks(projectId: string, includeCompleted: boolean = false): Promise<Task[]> {
    const tasksDir = this.getTasksPath(projectId);
    
    try {
      // Ensure directory exists
      await fs.mkdir(tasksDir, { recursive: true });
      
      const currentTasks = await this.parseTaskFile(
        path.join(tasksDir, 'current-tasks.md'),
        false
      );
      
      if (includeCompleted) {
        const completedTasks = await this.parseTaskFile(
          path.join(tasksDir, 'completed-tasks.md'),
          true
        );
        return [...currentTasks, ...completedTasks];
      }
      
      return currentTasks;
    } catch (error) {
      console.error('Error reading tasks:', error);
      return [];
    }
  }

  /**
   * Add a new task
   */
  async addTask(projectId: string, input: TaskInput): Promise<Task> {
    const tasksDir = this.getTasksPath(projectId);
    const currentTasksPath = path.join(tasksDir, 'current-tasks.md');
    
    // Ensure directory exists
    await fs.mkdir(tasksDir, { recursive: true });
    
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: input.text,
      completed: false,
      priority: input.priority,
      createdAt: new Date().toISOString()
    };
    
    // Read existing content
    let content = '';
    try {
      content = await fs.readFile(currentTasksPath, 'utf-8');
    } catch {
      content = '# Current Tasks\n\n';
    }
    
    // Add new task
    const taskLine = this.formatTaskLine(newTask);
    if (!content.endsWith('\n')) content += '\n';
    content += taskLine + '\n';
    
    await fs.writeFile(currentTasksPath, content, 'utf-8');
    
    // Update database stats if available
    if (this.db) {
      await this.updateProjectTaskStats(projectId);
    }
    
    return newTask;
  }

  /**
   * Update a task
   */
  async updateTask(
    projectId: string, 
    taskId: string, 
    updates: Partial<TaskInput>
  ): Promise<Task> {
    const tasks = await this.getTasks(projectId, true);
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }
    
    const task = tasks[taskIndex];
    const updatedTask = {
      ...task,
      ...updates,
      text: updates.text || task.text
    };
    
    // Rewrite the appropriate file
    await this.rewriteTaskFile(projectId, tasks, taskIndex, updatedTask);
    
    return updatedTask;
  }

  /**
   * Toggle task completion
   */
  async toggleTask(projectId: string, taskId: string): Promise<Task> {
    const tasks = await this.getTasks(projectId, true);
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }
    
    const task = tasks[taskIndex];
    const updatedTask = {
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined
    };
    
    // Move between files if completion status changed
    if (task.completed !== updatedTask.completed) {
      await this.moveTaskBetweenFiles(projectId, updatedTask);
    }
    
    // Update database stats if available
    if (this.db) {
      await this.updateProjectTaskStats(projectId);
    }
    
    return updatedTask;
  }

  /**
   * Delete a task
   */
  async deleteTask(projectId: string, taskId: string): Promise<void> {
    const tasks = await this.getTasks(projectId, true);
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }
    
    const task = tasks[taskIndex];
    const fileName = task.completed ? 'completed-tasks.md' : 'current-tasks.md';
    const filePath = path.join(this.getTasksPath(projectId), fileName);
    
    // Read file and remove task
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const updatedLines = lines.filter(line => {
      const parsed = this.parseTaskLine(line);
      return !parsed || parsed.id !== taskId;
    });
    
    await fs.writeFile(filePath, updatedLines.join('\n'), 'utf-8');
    
    // Update database stats if available
    if (this.db) {
      await this.updateProjectTaskStats(projectId);
    }
  }

  /**
   * Sync task files (move completed tasks to completed file)
   */
  async syncTaskFiles(projectId: string): Promise<void> {
    const tasksDir = this.getTasksPath(projectId);
    const currentPath = path.join(tasksDir, 'current-tasks.md');
    const completedPath = path.join(tasksDir, 'completed-tasks.md');
    
    // Read both files
    let currentContent = '';
    let completedContent = '';
    
    try {
      currentContent = await fs.readFile(currentPath, 'utf-8');
    } catch {
      currentContent = '# Current Tasks\n\n';
    }
    
    try {
      completedContent = await fs.readFile(completedPath, 'utf-8');
    } catch {
      completedContent = '# Completed Tasks\n\n';
    }
    
    // Parse and separate tasks
    const lines = currentContent.split('\n');
    const currentLines: string[] = [];
    const completedLines: string[] = [];
    
    for (const line of lines) {
      if (line.includes('- [x]')) {
        completedLines.push(line);
      } else {
        currentLines.push(line);
      }
    }
    
    // Write back if changes detected
    if (completedLines.length > 0) {
      await fs.writeFile(currentPath, currentLines.join('\n'), 'utf-8');
      
      if (!completedContent.endsWith('\n')) completedContent += '\n';
      completedContent += completedLines.join('\n') + '\n';
      await fs.writeFile(completedPath, completedContent, 'utf-8');
    }
  }

  /**
   * Parse a task file
   */
  private async parseTaskFile(filePath: string, completed: boolean): Promise<Task[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const tasks: Task[] = [];
      let taskIndex = 0;
      
      for (const line of lines) {
        const task = this.parseTaskLine(line, taskIndex, completed);
        if (task) {
          tasks.push(task);
          taskIndex++;
        }
      }
      
      return tasks;
    } catch {
      return [];
    }
  }

  /**
   * Parse a single task line
   */
  private parseTaskLine(line: string, index?: number, defaultCompleted?: boolean): Task | null {
    // Match markdown task format: - [ ] or - [x]
    const match = line.match(/^- \[([ x])\]\s+(\[([^\]]+)\]\s+)?(.+)$/);
    if (!match) return null;
    
    const completed = match[1] === 'x';
    const priority = match[3] as 'high' | 'medium' | 'low' | undefined;
    const text = match[4].trim();
    
    // Extract ID if present (format: <!-- id:task-123 -->)
    const idMatch = line.match(/<!-- id:([^ ]+) -->/);
    const id = idMatch ? idMatch[1] : `task-${index ?? Date.now()}`;
    
    return {
      id,
      text,
      completed: defaultCompleted !== undefined ? defaultCompleted : completed,
      priority,
      createdAt: new Date().toISOString(),
      completedAt: completed ? new Date().toISOString() : undefined
    };
  }

  /**
   * Format a task as a markdown line
   */
  private formatTaskLine(task: Task): string {
    const checkbox = task.completed ? '[x]' : '[ ]';
    const priority = task.priority ? `[${task.priority}] ` : '';
    const id = ` <!-- id:${task.id} -->`;
    
    return `- ${checkbox} ${priority}${task.text}${id}`;
  }

  /**
   * Rewrite task file with updated task
   */
  private async rewriteTaskFile(
    projectId: string,
    allTasks: Task[],
    taskIndex: number,
    updatedTask: Task
  ): Promise<void> {
    const fileName = updatedTask.completed ? 'completed-tasks.md' : 'current-tasks.md';
    const filePath = path.join(this.getTasksPath(projectId), fileName);
    
    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Find and replace the task line
    let taskCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (this.parseTaskLine(lines[i])) {
        if (taskCount === taskIndex) {
          lines[i] = this.formatTaskLine(updatedTask);
          break;
        }
        taskCount++;
      }
    }
    
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Move task between current and completed files
   */
  private async moveTaskBetweenFiles(projectId: string, task: Task): Promise<void> {
    const tasksDir = this.getTasksPath(projectId);
    const fromFile = task.completed ? 'current-tasks.md' : 'completed-tasks.md';
    const toFile = task.completed ? 'completed-tasks.md' : 'current-tasks.md';
    const fromPath = path.join(tasksDir, fromFile);
    const toPath = path.join(tasksDir, toFile);
    
    // Remove from source file
    let fromContent = await fs.readFile(fromPath, 'utf-8');
    const lines = fromContent.split('\n');
    const filteredLines = lines.filter(line => {
      const parsed = this.parseTaskLine(line);
      return !parsed || parsed.id !== task.id;
    });
    await fs.writeFile(fromPath, filteredLines.join('\n'), 'utf-8');
    
    // Add to destination file
    let toContent = '';
    try {
      toContent = await fs.readFile(toPath, 'utf-8');
    } catch {
      toContent = task.completed ? '# Completed Tasks\n\n' : '# Current Tasks\n\n';
    }
    
    if (!toContent.endsWith('\n')) toContent += '\n';
    toContent += this.formatTaskLine(task) + '\n';
    
    await fs.writeFile(toPath, toContent, 'utf-8');
  }

  /**
   * Update project task statistics in database
   */
  private async updateProjectTaskStats(projectId: string): Promise<void> {
    if (!this.db) return;
    
    const tasks = await this.getTasks(projectId, true);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    
    // Update or insert task stats
    this.db.run(`
      INSERT INTO project_tasks (project_id, task_file_path, task_count, completed_count)
      VALUES (?, 'tasks.md', ?, ?)
      ON CONFLICT(project_id, task_file_path) DO UPDATE SET
        task_count = excluded.task_count,
        completed_count = excluded.completed_count,
        last_modified = CURRENT_TIMESTAMP
    `, [projectId, totalTasks, completedTasks]);
  }

  /**
   * Get project tasks directory path
   */
  private getTasksPath(projectId: string): string {
    return path.join(process.env.HOME || '', '.ccmanager', 'tasks', projectId);
  }
}