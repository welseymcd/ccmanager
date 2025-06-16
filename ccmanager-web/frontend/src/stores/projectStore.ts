import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

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
  hasActiveMainSession: boolean;
  hasActiveDevSession: boolean;
  mainSessionId?: string;
  devServerStatus?: string;
  totalTasks: number;
  completedTasks: number;
}

interface ProjectState {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  
  // UI State
  isProjectDashboard: boolean;
  selectedProjectId: string | null;
  
  // Actions
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  updateLastAccessed: (projectId: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        projects: [],
        currentProject: null,
        isProjectDashboard: true,
        selectedProjectId: null,
        
        // Actions
        setProjects: (projects) => set({ projects }),
        
        setCurrentProject: (project) => set({ 
          currentProject: project,
          isProjectDashboard: !project,
          selectedProjectId: project?.id || null
        }),
        
        updateProject: (projectId, updates) => set((state) => ({
          projects: state.projects.map(p => 
            p.id === projectId ? { ...p, ...updates } : p
          ),
          currentProject: state.currentProject?.id === projectId 
            ? { ...state.currentProject, ...updates }
            : state.currentProject
        })),
        
        addProject: (project) => set((state) => ({
          projects: [project, ...state.projects]
        })),
        
        removeProject: (projectId) => set((state) => ({
          projects: state.projects.filter(p => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId 
            ? null 
            : state.currentProject,
          selectedProjectId: state.selectedProjectId === projectId 
            ? null 
            : state.selectedProjectId
        })),
        
        selectProject: (projectId) => {
          const project = get().projects.find(p => p.id === projectId);
          if (project) {
            set({ 
              currentProject: project,
              selectedProjectId: projectId,
              isProjectDashboard: false
            });
          }
        },
        
        updateLastAccessed: (projectId) => set((state) => ({
          projects: state.projects.map(p => 
            p.id === projectId 
              ? { ...p, lastAccessedAt: new Date().toISOString() }
              : p
          )
        }))
      }),
      {
        name: 'ccmanager-projects',
        partialize: (state) => ({ 
          selectedProjectId: state.selectedProjectId,
          // Don't persist projects - they come from API
        })
      }
    ),
    { name: 'ProjectStore' }
  )
);