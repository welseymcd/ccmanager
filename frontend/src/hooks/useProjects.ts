import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '../stores/projectStore';
import { Project } from '../stores/projectStore';
import { api } from '../api/client';

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

export function useProjects() {
  const { setProjects } = useProjectStore();
  
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/api/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      const projects = await response.json();
      setProjects(projects); // Sync with Zustand
      return projects as Project[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds to update session status
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await api.get(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      return response.json() as Promise<Project>;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { addProject } = useProjectStore();
  
  return useMutation({
    mutationFn: async (projectData: ProjectInput) => {
      const response = await api.post('/api/projects', projectData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create project');
      }
      return response.json() as Promise<Project>;
    },
    onSuccess: (newProject) => {
      addProject(newProject);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { updateProject } = useProjectStore();
  
  return useMutation({
    mutationFn: async ({ projectId, updates }: { projectId: string; updates: Partial<ProjectInput> }) => {
      const response = await api.put(`/api/projects/${projectId}`, updates);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update project');
      }
      return response.json() as Promise<Project>;
    },
    onSuccess: (updatedProject) => {
      updateProject(updatedProject.id, updatedProject);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', updatedProject.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { removeProject } = useProjectStore();
  
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.delete(`/api/projects/${projectId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete project');
      }
    },
    onSuccess: (_, projectId) => {
      removeProject(projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProjectAccess() {
  const { updateLastAccessed } = useProjectStore();
  
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.post(`/api/projects/${projectId}/access`);
      if (!response.ok) {
        throw new Error('Failed to update project access time');
      }
      return projectId;
    },
    onSuccess: (projectId) => {
      updateLastAccessed(projectId);
    },
  });
}