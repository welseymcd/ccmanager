import React, { useEffect, useState, useRef } from 'react';
import { Loader2, AlertCircle, Square, X, MoreVertical, Plus, Keyboard, List } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { SessionsManager } from './SessionsManager';
import { useWebSocket } from '../hooks/useWebSocket';
import { getWebSocketClient } from '../services/websocket';
import { useSessionStore } from '../stores/sessionStore';
import { useTabStore } from '../stores/tabStore';

interface ProjectTerminalViewProps {
  projectId: string;
  sessionType: 'main' | 'devserver' | 'orphan';
  workingDir: string;
  command?: string;
  orphanTabId?: string;
}

const ProjectTerminalView: React.FC<ProjectTerminalViewProps> = ({ 
  projectId, 
  sessionType, 
  workingDir,
  command,
  orphanTabId
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false); // Start with debug log hidden
  const [sessionBuffer, setSessionBuffer] = useState<string | undefined>();
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState(false);
  const [showSessionsManager, setShowSessionsManager] = useState(false);
  const terminalRef = useRef<any>(null);
  const isCreatingSession = useRef(false);
  const hasInitialized = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const mountId = useRef(Math.random().toString(36).substr(2, 9));
  const { sendMessage, client, isConnected, sendTerminalData } = useWebSocket();
  const { updateTabConnection, setSessionStatus, updateTabSessionId } = useSessionStore();
  const { createTab } = useTabStore();
  
  // Storage key for session persistence - include orphan tab ID for unique storage
  const sessionStorageKey = orphanTabId 
    ? `ccmanager_session_${projectId}_${sessionType}_${orphanTabId}`
    : `ccmanager_session_${projectId}_${sessionType}`;
  
  // Helper to add debug logs
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  // Create a unique tab ID for this project session
  const tabId = orphanTabId || `${projectId}-${sessionType}`;

  // Handle WebSocket connection and session creation
  useEffect(() => {
    if (!projectId || !workingDir) return;
    
    // If we already have a session, don't do anything
    if (sessionId) {
      return;
    }
    
    // If we're already creating a session, don't start another
    if (isCreatingSession.current) {
      return;
    }
    
    // Check auth token
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Not authenticated. Please log in again.');
      setStatus('error');
      setIsLoading(false);
      return;
    }
    
    const initializeSession = async () => {
      try {
        const wsClient = getWebSocketClient();
        
        if (!wsClient.isConnected()) {
          await wsClient.connect(authToken);
        }
        
        // Small delay to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now create or reconnect to session
        await createOrReconnectSession();
      } catch (error: any) {
        setError(error.message || 'Failed to connect');
        setStatus('error');
        setIsLoading(false);
      }
    };
    
    initializeSession();
  }, [projectId, workingDir, orphanTabId]); // Use orphanTabId instead of sessionType to prevent re-initialization on session type changes
  
  // Reset initialization flag on unmount
  useEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  // Clean up when sessionId changes (session swapping)
  useEffect(() => {
    return () => {
      // Clean up previous session state when sessionId changes
      if (isCreatingSession.current) {
        isCreatingSession.current = false;
      }
    };
  }, [sessionId]);

  // Listen for WebSocket connection state changes and handle disconnections
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    const handleConnected = () => {
      if (status === 'error') {
        setStatus('connecting');
        setError(null);
      }
    };
    
    const handleDisconnected = () => {
      if (sessionId && status === 'connected') {
        setStatus('disconnected');
        setError('Connection lost. Use the actions menu to reconnect.');
      }
    };
    
    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    
    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
    };
  }, [sessionId, status]);

  // Listen for session events
  useEffect(() => {
    if (!client || !sessionId) return;

    const handleSessionCreated = (message: any) => {
      addLog(`Received session_created event: ${JSON.stringify(message)}`);
      if (message.sessionId === sessionId) {
        setStatus('connected');
        setIsLoading(false);
        addLog('Session status updated to connected');
      }
    };

    const handleSessionClosed = (message: any) => {
      if (message.sessionId === sessionId) {
        setStatus('disconnected');
        setError('Session was closed. Use the actions menu to create a new session.');
        // Remove from localStorage when session closes
        localStorage.removeItem(sessionStorageKey);
        // Clear session ID so user can create a new one
        setSessionId(null);
        setIsLoading(false);
      }
    };

    const handleSessionError = (message: any) => {
      if (message.sessionId === sessionId) {
        setStatus('error');
        setError(message.error || 'Session error occurred');
        setIsLoading(false);
      }
    };

    client.on('session_created', handleSessionCreated);
    client.on('session_closed', handleSessionClosed);
    client.on('session_error', handleSessionError);

    return () => {
      client.off('session_created', handleSessionCreated);
      client.off('session_closed', handleSessionClosed);
      client.off('session_error', handleSessionError);
    };
  }, [client, sessionId]);

  // Handle click outside to close actions menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };

    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showActionsMenu]);

  const createOrReconnectSession = async () => {
    // Prevent multiple simultaneous session creation attempts
    if (isCreatingSession.current) {
      addLog('Session creation already in progress, skipping...');
      return;
    }
    
    if (sessionId) {
      addLog(`Session already exists: ${sessionId}, skipping creation...`);
      return;
    }
    
    isCreatingSession.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      // First, check server for any existing sessions for this project
      addLog('Checking server for existing sessions...');
      try {
        // Ensure we're connected before sending
        const wsClient = getWebSocketClient();
        if (!wsClient.isConnected()) {
          addLog('WebSocket not connected, waiting for connection...');
          await wsClient.waitForConnection(5000);
        }
        
        addLog('Sending list_sessions request...');
        
        // Small delay to ensure handlers are ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let listResponse;
        try {
          listResponse = await sendMessage({
            type: 'list_sessions'
          } as any);
          
          addLog(`Received response: ${JSON.stringify(listResponse)}`);
        } catch (err: any) {
          addLog(`Failed to list sessions: ${err.message}`);
          // Continue to create a new session if listing fails
        }
        
        if (listResponse && listResponse.type === 'sessions_list' && listResponse.sessions.length > 0) {
          // Filter sessions by working directory and command type
          const projectSessions = listResponse.sessions.filter((s: any) => {
            const isCorrectDir = s.workingDir === workingDir;
            const isCorrectType = sessionType === 'main' 
              ? s.command === 'claude' || s.command.includes('--dangerously-skip-permissions')
              : s.command === (command || 'npm run dev') || s.command.includes(command || 'npm run dev');
            return isCorrectDir && isCorrectType;
          });
          
          if (projectSessions.length > 0) {
            if (projectSessions.length === 1) {
              // Only one session, use it automatically
              const session = projectSessions[0];
              await connectToSession(session.id);
              return;
            } else {
              // Multiple sessions, let user choose - use first one for now
              addLog(`Found ${projectSessions.length} existing sessions for this project, using first one`);
              const session = projectSessions[0];
              await connectToSession(session.id);
              return;
            }
          } else {
            addLog('No existing sessions found for this project on server');
          }
        }
      } catch (err) {
        addLog(`Error checking server sessions: ${err}`);
      }
      
      // Then check localStorage as a fallback
      const storedSessionId = localStorage.getItem(sessionStorageKey);
      if (storedSessionId) {
        addLog(`Found stored session ID in localStorage: ${storedSessionId}`);
        
        // Check if this session is still active
        try {
          const listResponse = await sendMessage({
            type: 'list_sessions'
          } as any);
          
          if (listResponse.type === 'sessions_list') {
            const activeSession = listResponse.sessions.find(
              (s: any) => s.id === storedSessionId
            );
            
            if (activeSession) {
              addLog(`Session ${storedSessionId} from localStorage is still active`);
              await connectToSession(storedSessionId);
              return;
            } else {
              addLog(`Session ${storedSessionId} is no longer active`);
              localStorage.removeItem(sessionStorageKey);
            }
          }
        } catch (err) {
          addLog(`Error checking session status: ${err}`);
        }
      }
      // Create new session via WebSocket
      const wsClient = getWebSocketClient();
      if (!wsClient || !wsClient.isConnected()) {
        addLog('ERROR: WebSocket not connected');
        throw new Error('WebSocket not connected. Please refresh the page.');
      }

      // Get terminal dimensions from the terminal container if available
      let cols = 80;
      let rows = 24;
      
      if (terminalRef.current && typeof terminalRef.current.fit === 'function') {
        // Try to get actual terminal dimensions
        const container = document.querySelector('.xterm-screen');
        if (container) {
          const cellWidth = 9; // Approximate character width in pixels
          const cellHeight = 17; // Approximate character height in pixels
          cols = Math.floor(container.clientWidth / cellWidth) || 80;
          rows = Math.floor(container.clientHeight / cellHeight) || 24;
        }
      }
      
      // Determine the command based on session type
      let sessionCommand: string;
      if (sessionType === 'main') {
        sessionCommand = 'claude';
      } else if (sessionType === 'devserver') {
        sessionCommand = command || 'npm run dev';
      } else if (sessionType === 'orphan') {
        sessionCommand = 'bash'; // Always use bash for orphan terminals
      } else {
        sessionCommand = 'bash'; // Fallback
      }

      const sessionConfig = {
        type: 'create_session',
        workingDir,
        command: sessionCommand,
        cols,
        rows
      };
      
      addLog(`Sending create_session message: ${JSON.stringify(sessionConfig)}`);
      
      try {
        const wsResponse = await sendMessage(sessionConfig as any);
        
        addLog(`Received WebSocket response: ${JSON.stringify(wsResponse)}`);
        
        if (wsResponse.type === 'session_created') {
          setSessionId(wsResponse.sessionId);
          setStatus('connected'); // Set status immediately
          setIsLoading(false);
          addLog(`Session created successfully! ID: ${wsResponse.sessionId}`);
          
          // Store session ID for reconnection
          localStorage.setItem(sessionStorageKey, wsResponse.sessionId);
          
          // Update session store for orphan tabs
          if (sessionType === 'orphan' && orphanTabId) {
            updateTabSessionId(orphanTabId, wsResponse.sessionId);
            updateTabConnection(orphanTabId, true);
            setSessionStatus(wsResponse.sessionId, 'connected');
          }
        } else if (wsResponse.type === 'error' || wsResponse.type === 'session_error') {
          throw new Error(wsResponse.error || 'Failed to create session');
        } else {
          addLog(`Unexpected response type: ${wsResponse.type}`);
          throw new Error('Unexpected response from server');
        }
      } catch (timeoutError: any) {
        if (timeoutError.message.includes('timeout')) {
          addLog(`Session creation timed out. The server might be processing the request.`);
          // Try to list sessions again to see if it was created
          try {
            const listResponse = await sendMessage({ type: 'list_sessions' } as any);
            if (listResponse.type === 'sessions_list' && listResponse.sessions.length > 0) {
              const newSession = listResponse.sessions.find((s: any) => 
                s.workingDir === workingDir && 
                new Date(s.createdAt).getTime() > Date.now() - 35000 // Created in last 35 seconds
              );
              if (newSession) {
                addLog(`Found recently created session despite timeout: ${newSession.id}`);
                await connectToSession(newSession.id);
                return;
              }
            }
          } catch (e) {
            addLog(`Failed to check for sessions after timeout: ${e}`);
          }
        }
        throw timeoutError;
      }
    } catch (err: any) {
      addLog(`ERROR in createOrReconnectSession: ${err.message || err}`);
      addLog(`Error stack: ${err.stack || 'No stack trace'}`);  
      setError(err.message || 'Failed to create session');
      setStatus('error');
      setIsLoading(false);
    } finally {
      isCreatingSession.current = false;
    }
  };

  const handleReconnect = () => {
    setStatus('connecting');
    setError(null);
    setIsLoading(true);
    createOrReconnectSession();
  };

  const sendInterrupt = () => {
    if (sessionId) {
      // Send Ctrl+C (ASCII code 3)
      const ctrlC = '\x03';
      addLog('Sending interrupt signal (Ctrl+C)...');
      sendTerminalData(sessionId, ctrlC);
    } else {
      addLog('Cannot send interrupt: No active session');
    }
  };

  const connectToSession = async (sessionIdToConnect: string) => {
    addLog(`Connecting to session: ${sessionIdToConnect}`);
    setStatus('connecting'); // Keep as connecting while fetching buffer
    
    // Request session buffer first to restore terminal state
    try {
      addLog(`Requesting session buffer for: ${sessionIdToConnect}`);
      const bufferResponse = await sendMessage({
        type: 'get_session_buffer',
        sessionId: sessionIdToConnect
      } as any);
      
      addLog(`Buffer response type: ${bufferResponse.type}`);
      
      if (bufferResponse.type === 'session_buffer') {
        if (bufferResponse.buffer) {
          addLog(`Restored session buffer (${bufferResponse.buffer.length} bytes)`);
          setSessionBuffer(bufferResponse.buffer);
        } else {
          addLog(`Buffer response had no buffer data`);
          setSessionBuffer('');
        }
      } else {
        addLog(`Unexpected response type: ${bufferResponse.type}`);
      }
    } catch (err) {
      addLog(`Could not restore session buffer: ${err}`);
    }
    
    // Now set the session as connected
    setSessionId(sessionIdToConnect);
    setStatus('connected');
    setIsLoading(false);
    
    // Store in localStorage for faster reconnection
    localStorage.setItem(sessionStorageKey, sessionIdToConnect);
  };

  const closeSession = async () => {
    if (!sessionId) {
      addLog('No session to close');
      return;
    }
    
    // Confirm before closing
    const confirmClose = window.confirm(
      'Are you sure you want to close this session? This will terminate the Claude process.'
    );
    
    if (!confirmClose) {
      return;
    }
    
    addLog(`Closing session: ${sessionId}`);
    
    try {
      const response = await sendMessage({
        type: 'close_session',
        sessionId
      } as any);
      
      if (response.type === 'session_closed') {
        addLog('Session closed successfully');
        
        // Clean up state
        setSessionId(null);
        setStatus('disconnected');
        setSessionBuffer(undefined);
        
        // Remove from localStorage
        localStorage.removeItem(sessionStorageKey);
        
        // Don't automatically create a new session - let user do it manually
      } else {
        addLog(`Failed to close session: ${response.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      addLog(`Error closing session: ${err.message || err}`);
      setError('Failed to close session');
    }
  };

  const createNewSession = async () => {
    // Prevent multiple calls
    if (isCreatingSession.current) {
      addLog('Session creation already in progress, skipping...');
      return;
    }
    
    addLog('Creating new terminal tab with new session...');
    
    try {
      // Create a new tab instead of replacing the current session
      const tabCreated = createTab({
        title: sessionType === 'main' ? 'Claude' : 'Terminal',
        workingDir,
        command: sessionType === 'main' ? 'claude' : (command || 'bash'),
        sessionType: 'orphan' // Mark as orphan tab so it gets its own session
      });
      
      if (tabCreated) {
        addLog('New terminal tab created successfully');
      } else {
        throw new Error('Failed to create new tab (maximum tabs reached)');
      }
    } catch (err: any) {
      addLog(`Error creating new session: ${err.message || err}`);
      setError(err.message || 'Failed to create new session');
    }
  };


  if (isLoading && !sessionId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-400">Initializing {sessionType} session...</p>
          {showDebugLog && (
            <div className="mt-4 max-w-2xl text-left bg-gray-800 p-4 rounded-lg">
              <div className="text-xs font-mono text-gray-400 max-h-40 overflow-y-auto">
                {debugLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setShowDebugLog(!showDebugLog)}
            className="mt-4 text-xs text-gray-500 hover:text-gray-300"
          >
            {showDebugLog ? 'Hide' : 'Show'} Debug Logs
          </button>
        </div>
      </div>
    );
  }

  if (error && !sessionId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Session Error
          </h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={handleReconnect}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Handle disconnected state when no sessionId exists - provide clear options
  if (!sessionId && (status === 'disconnected' || status === 'error')) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            No Active Session
          </h3>
          <p className="text-gray-400 mb-4">
            {status === 'error' ? 'Session error occurred.' : 'The session has been disconnected or closed.'}
            {' '}Create a new session to continue.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setStatus('connecting');
                setError(null);
                createNewSession();
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Create New Session
            </button>
            <button
              onClick={() => setShowSessionsManager(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Browse Sessions
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-white dark:bg-gray-900">
      {/* Header - matching Dev Server panel style */}
      <div className="px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <h3 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
              {sessionType === 'main' ? 'Claude' : sessionType === 'devserver' ? 'Dev Server' : 'Terminal'}
            </h3>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === 'connected' ? 'bg-green-500' :
                status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className={`text-xs capitalize ${
                status === 'connected' ? 'text-green-600 dark:text-green-400' :
                status === 'connecting' ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {status === 'connected' ? 'Connected' : 
                 status === 'connecting' ? 'Connecting' : 
                 'Disconnected'}
              </span>
            </div>
            {/* WebSocket Status */}
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-blue-500' : 'bg-gray-400'
              }`} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                WS: {isConnected ? 'OK' : 'OFF'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Primary Actions */}
            {status === 'connected' && (
              <>
                <button
                  onClick={sendInterrupt}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-600 text-white text-xs sm:text-sm rounded-md hover:bg-red-700 transition-colors"
                  title="Send Ctrl+C interrupt signal"
                >
                  <Square className="w-4 h-4" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
                <button
                  onClick={() => setShowVirtualKeyboard(!showVirtualKeyboard)}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-600 text-white text-xs sm:text-sm rounded-md hover:bg-gray-700 transition-colors"
                  title="Toggle virtual keyboard"
                >
                  <Keyboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Keys</span>
                </button>
              </>
            )}
            
            {/* Dropdown Menu for Secondary Actions */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-600 text-white text-xs sm:text-sm rounded-md hover:bg-gray-700 transition-colors"
                aria-label="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            
            {/* Dropdown Menu */}
            {showActionsMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      setShowSessionsManager(true);
                    }}
                    className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <List className="w-3.5 h-3.5" />
                    Manage Sessions
                  </button>
                  
                  {status === 'connected' && (
                    <>
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          createNewSession();
                        }}
                        className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New Session
                      </button>
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          closeSession();
                        }}
                        className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-red-400 transition-colors flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" />
                        Close Session
                      </button>
                    </>
                  )}
                  
                  {(status === 'disconnected' || status === 'error') && (
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setStatus('connecting');
                        setError(null);
                        createNewSession();
                      }}
                      className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-green-400 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create New Session
                    </button>
                  )}
                  
                  <div className="border-t border-gray-700 my-1"></div>
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      setShowDebugLog(!showDebugLog);
                    }}
                    className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {showDebugLog ? 'Hide' : 'Show'} Debug Log
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Notification */}
      {error && sessionId && (
        <div className="bg-red-500 text-white px-4 py-2 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Debug Log Panel */}
      {showDebugLog && (
        <div className="bg-gray-800 border-b border-gray-700 p-2 sm:p-4 max-h-32 sm:max-h-48 overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Debug Log</h3>
            <button
              onClick={() => setDebugLogs([])}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="text-xs font-mono text-gray-400 space-y-1">
            {debugLogs.length === 0 ? (
              <div>No logs yet...</div>
            ) : (
              debugLogs.map((log, index) => (
                <div key={index} className="break-words whitespace-pre-wrap">
                  {log}
                </div>
              ))
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Session ID: {sessionId || 'Not created yet'}
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 min-h-0 bg-gray-900" style={{ position: 'relative', overflow: 'hidden' }}>
        <TerminalView
          ref={terminalRef}
          sessionId={sessionId}
          tabId={tabId}
          status={status}
          initialBuffer={sessionBuffer}
          addLog={addLog}
          showVirtualKeyboard={showVirtualKeyboard}
          onVirtualKeyboardToggle={() => setShowVirtualKeyboard(!showVirtualKeyboard)}
        />
      </div>

      {/* Sessions Manager Modal */}
      {showSessionsManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Session Manager
              </h2>
              <button
                onClick={() => setShowSessionsManager(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              <SessionsManager
                projectId={projectId}
                workingDir={workingDir}
                currentSessionId={sessionId}
                onSelectSession={(newSessionId) => {
                  if (newSessionId && newSessionId !== sessionId) {
                    connectToSession(newSessionId);
                  }
                  setShowSessionsManager(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectTerminalView;