import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UIState {
  // Layout
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  
  // Theme
  theme: 'light' | 'dark' | 'system';
  
  // Modals/Dialogs
  isNewProjectDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isTaskDialogOpen: boolean;
  
  // Connection
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Tasks
  showCompletedTasks: boolean;
  taskFilter: string;
  
  // Actions
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  openNewProjectDialog: () => void;
  closeNewProjectDialog: () => void;
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  openTaskDialog: () => void;
  closeTaskDialog: () => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  toggleCompletedTasks: () => void;
  setTaskFilter: (filter: string) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        sidebarWidth: 300,
        sidebarCollapsed: false,
        theme: 'system',
        isNewProjectDialogOpen: false,
        isSettingsDialogOpen: false,
        isTaskDialogOpen: false,
        connectionStatus: 'disconnected',
        showCompletedTasks: false,
        taskFilter: '',
        
        // Actions
        setSidebarWidth: (width) => set({ sidebarWidth: width }),
        toggleSidebar: () => set((state) => ({ 
          sidebarCollapsed: !state.sidebarCollapsed 
        })),
        setTheme: (theme) => set({ theme }),
        openNewProjectDialog: () => set({ isNewProjectDialogOpen: true }),
        closeNewProjectDialog: () => set({ isNewProjectDialogOpen: false }),
        openSettingsDialog: () => set({ isSettingsDialogOpen: true }),
        closeSettingsDialog: () => set({ isSettingsDialogOpen: false }),
        openTaskDialog: () => set({ isTaskDialogOpen: true }),
        closeTaskDialog: () => set({ isTaskDialogOpen: false }),
        setConnectionStatus: (status) => set({ connectionStatus: status }),
        toggleCompletedTasks: () => set((state) => ({ 
          showCompletedTasks: !state.showCompletedTasks 
        })),
        setTaskFilter: (filter) => set({ taskFilter: filter })
      }),
      {
        name: 'ccmanager-ui',
        partialize: (state) => ({
          sidebarWidth: state.sidebarWidth,
          sidebarCollapsed: state.sidebarCollapsed,
          theme: state.theme,
          showCompletedTasks: state.showCompletedTasks
        })
      }
    ),
    { name: 'UIStore' }
  )
);