import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskService } from './taskService';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');

describe('TaskService', () => {
  let taskService: TaskService;
  const projectId = 'test-project-123';
  const tasksPath = path.join(process.env.HOME || '', '.ccmanager', 'tasks', projectId);

  beforeEach(() => {
    taskService = new TaskService();
    vi.clearAllMocks();
  });

  describe('UNIT-006: should_mark_tasks_as_complete', () => {
    it('should toggle task completion status', async () => {
      const mockCurrentTasks = `# Current Tasks

- [ ] Set up authentication flow
- [ ] Implement user dashboard
- [ ] Add unit tests`;

      const mockCompletedTasks = `# Completed Tasks

- [x] Initial project setup`;

      (fs.readFile as any).mockImplementation((path: string) => {
        if (path.includes('current-tasks.md')) {
          return Promise.resolve(mockCurrentTasks);
        }
        if (path.includes('completed-tasks.md')) {
          return Promise.resolve(mockCompletedTasks);
        }
        return Promise.resolve('');
      });

      (fs.writeFile as any).mockResolvedValue(undefined);

      const task = await taskService.toggleTask(projectId, 'task-1');

      expect(task.completed).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(2); // Update both files
    });

    it('should move completed tasks to completed file', async () => {
      const mockCurrentTasks = `# Current Tasks

- [ ] Task 1
- [x] Task 2
- [ ] Task 3`;

      (fs.readFile as any).mockResolvedValue(mockCurrentTasks);
      (fs.writeFile as any).mockResolvedValue(undefined);

      await taskService.syncTaskFiles(projectId);

      // Should write updated current tasks without completed ones
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('current-tasks.md'),
        expect.not.stringContaining('[x] Task 2'),
        'utf-8'
      );
    });
  });

  describe('UNIT-007: should_filter_active_vs_completed_tasks', () => {
    it('should return only active tasks when showCompleted is false', async () => {
      const mockCurrentTasks = `# Current Tasks

- [ ] Active task 1
- [ ] Active task 2`;

      const mockCompletedTasks = `# Completed Tasks

- [x] Completed task 1
- [x] Completed task 2`;

      (fs.readFile as any).mockImplementation((path: string) => {
        if (path.includes('current-tasks.md')) {
          return Promise.resolve(mockCurrentTasks);
        }
        if (path.includes('completed-tasks.md')) {
          return Promise.resolve(mockCompletedTasks);
        }
        return Promise.resolve('');
      });

      const tasks = await taskService.getTasks(projectId, false);

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => !t.completed)).toBe(true);
    });

    it('should return all tasks when showCompleted is true', async () => {
      const mockCurrentTasks = `# Current Tasks

- [ ] Active task 1`;

      const mockCompletedTasks = `# Completed Tasks

- [x] Completed task 1`;

      (fs.readFile as any).mockImplementation((path: string) => {
        if (path.includes('current-tasks.md')) {
          return Promise.resolve(mockCurrentTasks);
        }
        if (path.includes('completed-tasks.md')) {
          return Promise.resolve(mockCompletedTasks);
        }
        return Promise.resolve('');
      });

      const tasks = await taskService.getTasks(projectId, true);

      expect(tasks).toHaveLength(2);
      expect(tasks.filter(t => t.completed)).toHaveLength(1);
      expect(tasks.filter(t => !t.completed)).toHaveLength(1);
    });
  });

  describe('INT-005: should_persist_tasks_to_markdown_files', () => {
    it('should add new task to markdown file', async () => {
      const mockContent = `# Current Tasks

- [ ] Existing task`;

      (fs.readFile as any).mockResolvedValue(mockContent);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const newTask = await taskService.addTask(projectId, {
        text: 'New task to add',
        priority: 'high'
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('current-tasks.md'),
        expect.stringContaining('- [ ] New task to add'),
        'utf-8'
      );
      expect(newTask.text).toBe('New task to add');
      expect(newTask.priority).toBe('high');
    });

    it('should maintain markdown formatting', async () => {
      const mockContent = `# Current Tasks

These are the current tasks for the project.

## High Priority
- [ ] Task 1

## Medium Priority
- [ ] Task 2`;

      (fs.readFile as any).mockResolvedValue(mockContent);
      (fs.writeFile as any).mockResolvedValue(undefined);

      await taskService.addTask(projectId, {
        text: 'New high priority task'
      });

      // Should preserve the structure
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('# Current Tasks'),
        'utf-8'
      );
    });

    it('should handle file not found gracefully', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      (fs.mkdir as any).mockResolvedValue(undefined);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const tasks = await taskService.getTasks(projectId);

      expect(tasks).toEqual([]);
      expect(fs.mkdir).toHaveBeenCalled();
    });
  });

  describe('Task parsing', () => {
    it('should parse tasks with priorities', async () => {
      const mockContent = `# Current Tasks

- [ ] Task without priority
- [ ] [high] High priority task
- [ ] [medium] Medium priority task
- [ ] [low] Low priority task`;

      (fs.readFile as any).mockResolvedValue(mockContent);

      const tasks = await taskService.getTasks(projectId);

      expect(tasks[0].priority).toBeUndefined();
      expect(tasks[1].priority).toBe('high');
      expect(tasks[2].priority).toBe('medium');
      expect(tasks[3].priority).toBe('low');
    });

    it('should generate unique IDs for tasks', async () => {
      const mockContent = `# Current Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;

      (fs.readFile as any).mockResolvedValue(mockContent);

      const tasks = await taskService.getTasks(projectId);

      const ids = tasks.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Task updates', () => {
    it('should update task text', async () => {
      const mockContent = `# Current Tasks

- [ ] Original task text`;

      (fs.readFile as any).mockResolvedValue(mockContent);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const updatedTask = await taskService.updateTask(projectId, 'task-0', {
        text: 'Updated task text'
      });

      expect(updatedTask.text).toBe('Updated task text');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('- [ ] Updated task text'),
        'utf-8'
      );
    });

    it('should update task priority', async () => {
      const mockContent = `# Current Tasks

- [ ] Task without priority`;

      (fs.readFile as any).mockResolvedValue(mockContent);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const updatedTask = await taskService.updateTask(projectId, 'task-0', {
        priority: 'high'
      });

      expect(updatedTask.priority).toBe('high');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('- [ ] [high] Task without priority'),
        'utf-8'
      );
    });
  });

  describe('Task deletion', () => {
    it('should delete task from file', async () => {
      const mockContent = `# Current Tasks

- [ ] Task 1
- [ ] Task to delete
- [ ] Task 3`;

      (fs.readFile as any).mockResolvedValue(mockContent);
      (fs.writeFile as any).mockResolvedValue(undefined);

      await taskService.deleteTask(projectId, 'task-1');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('Task to delete'),
        'utf-8'
      );
    });
  });
});