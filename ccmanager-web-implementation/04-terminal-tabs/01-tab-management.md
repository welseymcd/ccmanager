# Step 01: Terminal Tab Management Implementation

## Objective
Implement the core terminal tab management system with multiple independent Claude Code sessions, including frontend React components and state management.

## Test First: Tab Manager Store Tests

```typescript
// frontend/tests/stores/tabStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useTabStore } from '../../src/stores/tabStore';
import { describe, test, expect, beforeEach } from 'vitest';

describe('Tab Store', () => {
  beforeEach(() => {
    // Reset store state
    useTabStore.setState({
      tabs: [],
      activeTabId: null
    });
  });

  test('creates new tab', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({
        workingDir: '/home/project',
        title: 'Project'
      });
    });
    
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]).toMatchObject({
      id: expect.stringMatching(/^tab_/),
      title: 'Project',
      workingDir: '/home/project',
      status: 'connecting'
    });
  });

  test('sets active tab on creation', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  test('enforces maximum tab limit', () => {
    const { result } = renderHook(() => useTabStore());
    
    // Create 20 tabs
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.createTab({ workingDir: `/home/test${i}` });
      }
    });
    
    expect(result.current.tabs).toHaveLength(20);
    
    // 21st tab should fail
    act(() => {
      const created = result.current.createTab({ workingDir: '/home/test21' });
      expect(created).toBe(false);
    });
    
    expect(result.current.tabs).toHaveLength(20);
  });

  test('switches between tabs', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test1', title: 'Tab 1' });
      result.current.createTab({ workingDir: '/home/test2', title: 'Tab 2' });
    });
    
    const tab1Id = result.current.tabs[0].id;
    const tab2Id = result.current.tabs[1].id;
    
    expect(result.current.activeTabId).toBe(tab2Id);
    
    act(() => {
      result.current.setActiveTab(tab1Id);
    });
    
    expect(result.current.activeTabId).toBe(tab1Id);
  });

  test('closes tab with confirmation', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    const tabId = result.current.tabs[0].id;
    
    // Mark as having active process
    act(() => {
      result.current.updateTab(tabId, { hasActiveProcess: true });
    });
    
    // Close should require confirmation
    act(() => {
      const needsConfirm = result.current.closeTab(tabId, false);
      expect(needsConfirm).toBe(true);
    });
    
    expect(result.current.tabs).toHaveLength(1);
    
    // Force close should work
    act(() => {
      result.current.closeTab(tabId, true);
    });
    
    expect(result.current.tabs).toHaveLength(0);
  });

  test('updates tab properties', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    const tabId = result.current.tabs[0].id;
    
    act(() => {
      result.current.updateTab(tabId, {
        title: 'Updated Title',
        status: 'connected',
        sessionId: 'sess_123'
      });
    });
    
    expect(result.current.tabs[0]).toMatchObject({
      title: 'Updated Title',
      status: 'connected',
      sessionId: 'sess_123'
    });
  });

  test('persists tabs to localStorage', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test1', title: 'Tab 1' });
      result.current.createTab({ workingDir: '/home/test2', title: 'Tab 2' });
    });
    
    // Get persisted state
    const persisted = result.current.getPersistedState();
    
    expect(persisted.tabs).toHaveLength(2);
    expect(persisted.activeTabId).toBe(result.current.activeTabId);
  });

  test('restores tabs from localStorage', () => {
    const { result } = renderHook(() => useTabStore());
    
    const savedState = {
      tabs: [
        {
          id: 'tab_saved1',
          title: 'Restored Tab 1',
          workingDir: '/home/restored1',
          sessionId: 'sess_old1',
          status: 'disconnected' as const,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab_saved2',
          title: 'Restored Tab 2',
          workingDir: '/home/restored2',
          sessionId: 'sess_old2',
          status: 'disconnected' as const,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab_saved1'
    };
    
    act(() => {
      result.current.restoreFromPersistedState(savedState);
    });
    
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe('tab_saved1');
    expect(result.current.tabs[0].status).toBe('disconnected');
  });
});
```

## Test First: Tab Component Tests

```typescript
// frontend/tests/components/TabBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../src/components/TabBar';
import { useTabStore } from '../../src/stores/tabStore';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('TabBar Component', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null
    });
  });

  test('renders tabs', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Project A',
          workingDir: '/home/projecta',
          status: 'connected',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Project B',
          workingDir: '/home/projectb',
          status: 'connecting',
          sessionId: null,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    expect(screen.getByText('Project A')).toBeInTheDocument();
    expect(screen.getByText('Project B')).toBeInTheDocument();
  });

  test('shows status indicators', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Connected',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Connecting',
          status: 'connecting',
          workingDir: '/test',
          sessionId: null,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab3',
          title: 'Disconnected',
          status: 'disconnected',
          workingDir: '/test',
          sessionId: 'old_sess',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    expect(screen.getByTestId('status-connected')).toBeInTheDocument();
    expect(screen.getByTestId('status-connecting')).toBeInTheDocument();
    expect(screen.getByTestId('status-disconnected')).toBeInTheDocument();
  });

  test('handles tab click', () => {
    const setActiveTab = vi.fn();
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Tab 1',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Tab 2',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess2',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1',
      setActiveTab
    });

    render(<TabBar />);
    
    fireEvent.click(screen.getByText('Tab 2'));
    expect(setActiveTab).toHaveBeenCalledWith('tab2');
  });

  test('shows close button on hover', () => {
    useTabStore.setState({
      tabs: [{
        id: 'tab1',
        title: 'Hover Me',
        status: 'connected',
        workingDir: '/test',
        sessionId: 'sess1',
        hasActiveProcess: false,
        createdAt: new Date().toISOString()
      }],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    const tab = screen.getByText('Hover Me').closest('[role="tab"]');
    
    // Close button hidden initially
    expect(screen.queryByLabelText('Close tab')).not.toBeInTheDocument();
    
    // Show on hover
    fireEvent.mouseEnter(tab!);
    expect(screen.getByLabelText('Close tab')).toBeInTheDocument();
  });

  test('creates new tab with plus button', () => {
    const createTab = vi.fn();
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      createTab
    });

    render(<TabBar />);
    
    fireEvent.click(screen.getByLabelText('New tab'));
    expect(createTab).toHaveBeenCalled();
  });

  test('shows tab limit warning', () => {
    const tabs = Array.from({ length: 20 }, (_, i) => ({
      id: `tab${i}`,
      title: `Tab ${i}`,
      status: 'connected' as const,
      workingDir: '/test',
      sessionId: `sess${i}`,
      hasActiveProcess: false,
      createdAt: new Date().toISOString()
    }));

    useTabStore.setState({
      tabs,
      activeTabId: 'tab0'
    });

    render(<TabBar />);
    
    const newTabButton = screen.getByLabelText('New tab');
    expect(newTabButton).toBeDisabled();
    expect(screen.getByText('Maximum tabs reached')).toBeInTheDocument();
  });
});
```

## Implementation

### 1. Tab Store (Zustand)

```typescript
// frontend/src/stores/tabStore.ts
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
```

### 2. TabBar Component

```typescript
// frontend/src/components/TabBar.tsx
import React, { useState } from 'react';
import { useTabStore } from '../stores/tabStore';
import { cn } from '../utils/cn';
import { X, Plus, Circle } from 'lucide-react';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, createTab } = useTabStore();
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const needsConfirm = closeTab(tabId);
    
    if (needsConfirm) {
      if (confirm('This tab has an active process. Are you sure you want to close it?')) {
        closeTab(tabId, true);
      }
    }
  };

  const handleNewTab = () => {
    if (tabs.length >= 20) return;
    setShowNewTabDialog(true);
  };

  const getStatusIcon = (status: string) => {
    const statusColors = {
      connecting: 'text-yellow-500 animate-pulse',
      connected: 'text-green-500',
      disconnected: 'text-gray-500',
      error: 'text-red-500'
    };

    return (
      <Circle
        className={cn('w-2 h-2 fill-current', statusColors[status])}
        data-testid={`status-${status}`}
      />
    );
  };

  return (
    <>
      <div className="flex items-center bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <div className="flex items-center">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors',
                'border-r border-gray-800 hover:bg-gray-800',
                activeTabId === tab.id && 'bg-gray-800 text-white',
                activeTabId !== tab.id && 'text-gray-400'
              )}
              onClick={() => setActiveTab(tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
            >
              {getStatusIcon(tab.status)}
              <span className="max-w-[200px] truncate">{tab.title}</span>
              
              {hoveredTabId === tab.id && (
                <button
                  className="ml-2 p-0.5 rounded hover:bg-gray-700"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  aria-label="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          className={cn(
            'p-2 hover:bg-gray-800 transition-colors',
            tabs.length >= 20 && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleNewTab}
          disabled={tabs.length >= 20}
          aria-label="New tab"
        >
          <Plus className="w-4 h-4" />
        </button>
        
        {tabs.length >= 20 && (
          <span className="text-xs text-gray-500 ml-2">Maximum tabs reached</span>
        )}
      </div>

      {showNewTabDialog && (
        <NewTabDialog
          onClose={() => setShowNewTabDialog(false)}
          onCreate={(config) => {
            createTab(config);
            setShowNewTabDialog(false);
          }}
        />
      )}
    </>
  );
}
```

### 3. Tab Container Component

```typescript
// frontend/src/components/TabContainer.tsx
import React, { useEffect, useRef } from 'react';
import { useTabStore } from '../stores/tabStore';
import { TerminalView } from './TerminalView';
import { useWebSocket } from '../hooks/useWebSocket';

export function TabContainer() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const { sendMessage } = useWebSocket();
  const terminalRefs = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    // Handle tab restoration on mount
    tabs.forEach(tab => {
      if (tab.status === 'disconnected' && tab.sessionId) {
        // Attempt to reconnect to existing session
        reconnectSession(tab.id, tab.sessionId);
      } else if (tab.status === 'connecting' && !tab.sessionId) {
        // Create new session
        createSession(tab.id, tab.workingDir);
      }
    });
  }, []);

  const createSession = async (tabId: string, workingDir: string) => {
    try {
      const response = await sendMessage({
        type: 'create_session',
        workingDir
      });

      if (response.type === 'session_created') {
        useTabStore.getState().updateTab(tabId, {
          sessionId: response.sessionId,
          status: 'connected'
        });
      }
    } catch (error) {
      useTabStore.getState().updateTab(tabId, {
        status: 'error'
      });
    }
  };

  const reconnectSession = async (tabId: string, sessionId: string) => {
    try {
      const response = await sendMessage({
        type: 'reconnect_session',
        sessionId
      });

      if (response.type === 'session_reconnected') {
        useTabStore.getState().updateTab(tabId, {
          status: 'connected'
        });
      } else {
        // Session no longer exists, create new one
        createSession(tabId, useTabStore.getState().tabs.find(t => t.id === tabId)!.workingDir);
      }
    } catch (error) {
      useTabStore.getState().updateTab(tabId, {
        status: 'error'
      });
    }
  };

  if (!activeTab) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-4">No active session</p>
          <p className="text-sm">Create a new tab to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-gray-900">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={tab.id === activeTabId ? 'block h-full' : 'hidden'}
        >
          <TerminalView
            ref={(ref) => {
              if (ref) terminalRefs.current.set(tab.id, ref);
              else terminalRefs.current.delete(tab.id);
            }}
            sessionId={tab.sessionId}
            tabId={tab.id}
            status={tab.status}
          />
        </div>
      ))}
    </div>
  );
}
```

### 4. Keyboard Shortcuts Hook

```typescript
// frontend/src/hooks/useTabShortcuts.ts
import { useEffect } from 'react';
import { useTabStore } from '../stores/tabStore';

export function useTabShortcuts() {
  const { tabs, activeTabId, setActiveTab, createTab, closeTab } = useTabStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + T: New tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        createTab({ workingDir: process.cwd() });
      }

      // Ctrl/Cmd + W: Close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        const needsConfirm = closeTab(activeTabId);
        if (needsConfirm) {
          if (confirm('This tab has an active process. Are you sure you want to close it?')) {
            closeTab(activeTabId, true);
          }
        }
      }

      // Ctrl/Cmd + Tab: Next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        if (tabs[nextIndex]) {
          setActiveTab(tabs[nextIndex].id);
        }
      }

      // Ctrl/Cmd + Shift + Tab: Previous tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        if (tabs[prevIndex]) {
          setActiveTab(tabs[prevIndex].id);
        }
      }

      // Ctrl/Cmd + 1-9: Switch to specific tab
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          setActiveTab(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, setActiveTab, createTab, closeTab]);
}
```

## Verification

Run tab management tests:

```bash
cd frontend && npm test -- tests/stores/tabStore.test.ts
cd frontend && npm test -- tests/components/TabBar.test.tsx
```

## Performance Considerations

1. **Tab Rendering**: Only render active tab's terminal
2. **State Persistence**: Debounce localStorage writes
3. **Memory Management**: Clear terminal buffers for inactive tabs
4. **Event Listeners**: Proper cleanup on unmount

## Rollback Plan

If tab management fails:
1. Fall back to single session mode
2. Clear corrupted localStorage state
3. Implement simple tab UI without persistence
4. Log tab operations for debugging

## Next Step
Proceed to [02-terminal-integration.md](./02-terminal-integration.md) to integrate xterm.js terminals.