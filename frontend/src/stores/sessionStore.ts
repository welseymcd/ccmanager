import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface SessionTab {
  id: string;
  sessionId: string;
  projectId: string;
  sessionType: 'main' | 'devserver' | 'orphan';
  title: string;
  isActive: boolean;
  isConnected: boolean;
  hasUnreadOutput: boolean;
}

export interface TerminalLine {
  lineNumber: number;
  content: string;
  type: 'input' | 'output' | 'system';
  timestamp: string;
}

interface SessionState {
  // Session tabs
  tabs: SessionTab[];
  activeTabId: string | null;
  
  // Session data
  sessionHistory: Record<string, TerminalLine[]>;
  sessionStatus: Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  
  // UI state
  activeProjectSessionType: 'main' | 'devserver';
  
  // Actions
  addTab: (tab: Omit<SessionTab, 'id'>) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabConnection: (tabId: string, isConnected: boolean) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  markTabAsRead: (tabId: string) => void;
  setSessionHistory: (sessionId: string, history: TerminalLine[]) => void;
  appendSessionOutput: (sessionId: string, line: TerminalLine) => void;
  setSessionStatus: (sessionId: string, status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  setActiveSessionType: (type: 'main' | 'devserver') => void;
  createOrphanTab: (projectId: string, title?: string) => string;
  updateTabSessionId: (tabId: string, sessionId: string) => void;
  clearProjectSessions: (projectId: string) => void;
}

export const useSessionStore = create<SessionState>()(
  devtools(
    (set) => ({
      // Initial state
      tabs: [],
      activeTabId: null,
      sessionHistory: {},
      sessionStatus: {},
      activeProjectSessionType: 'main',
      
      // Actions
      addTab: (tabData) => {
        const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tab: SessionTab = {
          id: tabId,
          ...tabData,
          isActive: tabData.isActive ?? false,
          isConnected: tabData.isConnected ?? false,
          hasUnreadOutput: tabData.hasUnreadOutput ?? false
        };
        
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: state.activeTabId || tabId
        }));
        
        return tabId;
      },
      
      removeTab: (tabId) => set((state) => {
        const newTabs = state.tabs.filter(t => t.id !== tabId);
        const removedTab = state.tabs.find(t => t.id === tabId);
        
        // Clean up session data
        const newSessionHistory = { ...state.sessionHistory };
        const newSessionStatus = { ...state.sessionStatus };
        if (removedTab) {
          delete newSessionHistory[removedTab.sessionId];
          delete newSessionStatus[removedTab.sessionId];
        }
        
        // Update active tab if needed
        let newActiveTabId = state.activeTabId;
        if (state.activeTabId === tabId) {
          newActiveTabId = newTabs.length > 0 ? newTabs[0].id : null;
        }
        
        return {
          tabs: newTabs,
          activeTabId: newActiveTabId,
          sessionHistory: newSessionHistory,
          sessionStatus: newSessionStatus
        };
      }),
      
      setActiveTab: (tabId) => set((state) => ({
        tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tabId })),
        activeTabId: tabId
      })),
      
      updateTabConnection: (tabId, isConnected) => set((state) => ({
        tabs: state.tabs.map(t => 
          t.id === tabId ? { ...t, isConnected } : t
        )
      })),
      
      updateTabTitle: (tabId, title) => set((state) => ({
        tabs: state.tabs.map(t => 
          t.id === tabId ? { ...t, title } : t
        )
      })),
      
      markTabAsRead: (tabId) => set((state) => ({
        tabs: state.tabs.map(t => 
          t.id === tabId ? { ...t, hasUnreadOutput: false } : t
        )
      })),
      
      setSessionHistory: (sessionId, history) => set((state) => ({
        sessionHistory: {
          ...state.sessionHistory,
          [sessionId]: history
        }
      })),
      
      appendSessionOutput: (sessionId, line) => set((state) => {
        const currentHistory = state.sessionHistory[sessionId] || [];
        
        return {
          sessionHistory: {
            ...state.sessionHistory,
            [sessionId]: [...currentHistory, line]
          },
          tabs: state.tabs.map(t => 
            t.sessionId === sessionId && t.id !== state.activeTabId
              ? { ...t, hasUnreadOutput: true }
              : t
          )
        };
      }),
      
      setSessionStatus: (sessionId, status) => set((state) => ({
        sessionStatus: {
          ...state.sessionStatus,
          [sessionId]: status
        }
      })),
      
      setActiveSessionType: (type) => set({ activeProjectSessionType: type }),
      
      createOrphanTab: (projectId, title) => {
        const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const orphanTitle = title || `Terminal ${Date.now().toString().slice(-4)}`;
        
        const newTab: SessionTab = {
          id: tabId,
          sessionId: '', // Will be set when session is created
          projectId,
          sessionType: 'orphan',
          title: orphanTitle,
          isActive: false,
          isConnected: false,
          hasUnreadOutput: false
        };
        
        set((state) => ({
          tabs: [...state.tabs, newTab]
        }));
        
        return tabId;
      },
      
      updateTabSessionId: (tabId, sessionId) => set((state) => ({
        tabs: state.tabs.map(tab =>
          tab.id === tabId 
            ? { ...tab, sessionId }
            : tab
        )
      })),
      
      clearProjectSessions: (projectId) => set((state) => {
        const remainingTabs = state.tabs.filter(t => t.projectId !== projectId);
        const removedTabs = state.tabs.filter(t => t.projectId === projectId);
        
        // Clean up session data for removed tabs
        const newSessionHistory = { ...state.sessionHistory };
        const newSessionStatus = { ...state.sessionStatus };
        removedTabs.forEach(tab => {
          delete newSessionHistory[tab.sessionId];
          delete newSessionStatus[tab.sessionId];
        });
        
        return {
          tabs: remainingTabs,
          activeTabId: remainingTabs.length > 0 ? remainingTabs[0].id : null,
          sessionHistory: newSessionHistory,
          sessionStatus: newSessionStatus
        };
      })
    }),
    { name: 'SessionStore' }
  )
);