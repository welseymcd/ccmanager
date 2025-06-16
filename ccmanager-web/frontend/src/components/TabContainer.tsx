import { useEffect, useRef } from 'react';
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
        console.log('Creating session for tab:', tab.id, 'workingDir:', tab.workingDir);
        createSession(tab.id, tab.workingDir);
      }
    });
  }, []);

  // Watch for new tabs that need sessions
  useEffect(() => {
    tabs.forEach(tab => {
      if (tab.status === 'connecting' && !tab.sessionId) {
        console.log('New tab detected, creating session for:', tab.id);
        createSession(tab.id, tab.workingDir);
      }
    });
  }, [tabs]);

  const createSession = async (tabId: string, workingDir: string) => {
    try {
      console.log('Sending create_session message for workingDir:', workingDir);
      const response = await sendMessage({
        type: 'create_session',
        workingDir
      } as any);

      console.log('Got response:', response);
      if (response.type === 'session_created') {
        useTabStore.getState().updateTab(tabId, {
          sessionId: response.sessionId,
          status: 'connected'
        });
      }
    } catch (error) {
      console.error('Error creating session:', error);
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
      } as any);

      if (response.type === 'session_reconnected') {
        useTabStore.getState().updateTab(tabId, {
          status: 'connected'
        });
      } else {
        // Session no longer exists, create new one
        const tab = useTabStore.getState().tabs.find(t => t.id === tabId);
        if (tab) {
          createSession(tabId, tab.workingDir);
        }
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