import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tab {
  id: string;
  title: string;
  workingDir: string;
  sessionId: string | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  hasActiveProcess: boolean;
  createdAt: string;
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  
  // Actions
  createTab: (config: { workingDir: string; title?: string }) => boolean;
  closeTab: (tabId: string, force?: boolean) => boolean;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  clearTabs: () => void;
  getPersistedState: () => { tabs: Tab[]; activeTabId: string | null };
  restoreFromPersistedState: (state: { tabs: Tab[]; activeTabId: string | null }) => void;
}

const MAX_TABS = 20;

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      createTab: (config) => {
        const state = get();
        
        if (state.tabs.length >= MAX_TABS) {
          return false;
        }

        const tab: Tab = {
          id: `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: config.title || getDirectoryName(config.workingDir),
          workingDir: config.workingDir,
          sessionId: null,
          status: 'connecting',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        };

        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id
        }));

        return true;
      },

      closeTab: (tabId, force = false) => {
        const state = get();
        const tab = state.tabs.find(t => t.id === tabId);
        
        if (!tab) return false;
        
        // Check if confirmation needed
        if (!force && tab.hasActiveProcess) {
          return true; // Needs confirmation
        }

        set((state) => {
          const newTabs = state.tabs.filter(t => t.id !== tabId);
          let newActiveTabId = state.activeTabId;
          
          // If closing active tab, switch to another
          if (state.activeTabId === tabId) {
            const currentIndex = state.tabs.findIndex(t => t.id === tabId);
            if (newTabs.length > 0) {
              // Try to activate the tab to the right, or left if none
              const newIndex = Math.min(currentIndex, newTabs.length - 1);
              newActiveTabId = newTabs[newIndex].id;
            } else {
              newActiveTabId = null;
            }
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId
          };
        });

        return false; // Closed successfully
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      updateTab: (tabId, updates) => {
        set((state) => ({
          tabs: state.tabs.map(tab =>
            tab.id === tabId ? { ...tab, ...updates } : tab
          )
        }));
      },

      clearTabs: () => {
        set({ tabs: [], activeTabId: null });
      },

      getPersistedState: () => {
        const state = get();
        return {
          tabs: state.tabs,
          activeTabId: state.activeTabId
        };
      },

      restoreFromPersistedState: (savedState) => {
        // Mark all restored tabs as disconnected
        const restoredTabs = savedState.tabs.map(tab => ({
          ...tab,
          status: 'disconnected' as const,
          sessionId: tab.sessionId // Keep old session ID for reconnection
        }));

        set({
          tabs: restoredTabs,
          activeTabId: savedState.activeTabId
        });
      }
    }),
    {
      name: 'ccmanager-tabs',
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId
      })
    }
  )
);

function getDirectoryName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'Root';
}