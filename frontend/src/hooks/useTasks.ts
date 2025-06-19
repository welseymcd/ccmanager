import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

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

export function useTasks(projectId: string, includeCompleted: boolean = false) {
  return useQuery({
    queryKey: ['tasks', projectId, includeCompleted],
    queryFn: async () => {
      const response = await api.get(
        `/api/projects/${projectId}/tasks?includeCompleted=${includeCompleted}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return response.json() as Promise<Task[]>;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useAddTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const response = await api.post(`/api/projects/${projectId}/tasks`, input);
      if (!response.ok) {
        throw new Error('Failed to add task');
      }
      return response.json() as Promise<Task>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] }); // Update task counts
    },
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<TaskInput> }) => {
      const response = await api.put(`/api/projects/${projectId}/tasks/${taskId}`, updates);
      if (!response.ok) {
        throw new Error('Failed to update task');
      }
      return response.json() as Promise<Task>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}

export function useToggleTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const response = await api.post(`/api/projects/${projectId}/tasks/${taskId}/toggle`);
      if (!response.ok) {
        throw new Error('Failed to toggle task');
      }
      return response.json() as Promise<Task>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] }); // Update task counts
    },
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const response = await api.delete(`/api/projects/${projectId}/tasks/${taskId}`);
      if (!response.ok) {
        throw new Error('Failed to delete task');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] }); // Update task counts
    },
  });
}

export function useSyncTasks(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await api.post(`/api/projects/${projectId}/tasks/sync`);
      if (!response.ok) {
        throw new Error('Failed to sync tasks');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}