import React, { useEffect, useState, useRef } from 'react';
import { Loader2, AlertCircle, Square, X, MoreVertical, Plus } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { useWebSocket } from '../hooks/useWebSocket';
import { getWebSocketClient } from '../services/websocket';

interface ProjectTerminalViewProps {
  projectId: string;
  sessionType: 'main' | 'devserver';
  workingDir: string;
  command?: string;
}

const ProjectTerminalView: React.FC<ProjectTerminalViewProps> = ({ 
  projectId, 
  sessionType, 
  workingDir,
  command 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false); // Start with debug log hidden
  const [sessionBuffer, setSessionBuffer] = useState<string | undefined>();
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const terminalRef = useRef<any>(null);
  const isCreatingSession = useRef(false);
  const hasInitialized = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const mountId = useRef(Math.random().toString(36).substr(2, 9));
  const { sendMessage, client, isConnected, sendTerminalData } = useWebSocket();
  
  // Storage key for session persistence
  const sessionStorageKey = `ccmanager_session_${projectId}_${sessionType}`;
  
  // Helper to add debug logs
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  // Create a unique tab ID for this project session
  const tabId = `${projectId}-${sessionType}`;

  // Handle WebSocket connection and session creation
  useEffect(() => {
    if (!projectId || !workingDir) return;
    
    addLog(`[${mountId.current}] Component effect running - sessionId: ${sessionId}, isCreating: ${isCreatingSession.current}`);
    
    // If we already have a session, don't do anything
    if (sessionId) {
      addLog(`[${mountId.current}] Already have session: ${sessionId}`);
      return;
    }
    
    // If we're already creating a session, don't start another
    if (isCreatingSession.current) {
      addLog(`[${mountId.current}] Already creating session, skipping...`);
      return;
    }
    
    // Check auth token
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
      addLog('ERROR: No auth token found. User needs to log in.');
      setError('Not authenticated. Please log in again.');
      setStatus('error');
      setIsLoading(false);
      return;
    }
    
    const initializeSession = async () => {
      try {
        const wsClient = getWebSocketClient();
        
        if (!wsClient.isConnected()) {
          addLog('WebSocket not connected, connecting...');
          await wsClient.connect(authToken);
          addLog('WebSocket connected successfully');
        }
        
        // Small delay to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now create or reconnect to session
        await createOrReconnectSession();
      } catch (error: any) {
        addLog(`Failed to initialize: ${error.message}`);
        setError(error.message || 'Failed to connect');
        setStatus('error');
        setIsLoading(false);
      }
    };
    
    initializeSession();
  }, [projectId, workingDir, sessionType, sessionId]);
  
  // Reset initialization flag on unmount
  useEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  // Listen for WebSocket connection state changes
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    const handleConnected = () => {
      addLog('WebSocket connected event received!');
    };
    
    const handleDisconnected = () => {
      addLog('WebSocket disconnected event received!');
    };
    
    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    
    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
    };
  }, []);

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
      addLog(`Received session_closed event: ${JSON.stringify(message)}`);
      if (message.sessionId === sessionId) {
        setStatus('disconnected');
        addLog('Session status updated to disconnected');
        // Remove from localStorage when session closes
        localStorage.removeItem(sessionStorageKey);
      }
    };

    const handleSessionError = (message: any) => {
      addLog(`Received session_error event: ${JSON.stringify(message)}`);
      if (message.sessionId === sessionId) {
        setStatus('error');
        setError(message.error);
        addLog(`Session error: ${message.error}`);
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
              // Multiple sessions, let user choose
              addLog(`Found ${projectSessions.length} existing sessions for this project`);
              setAvailableSessions(projectSessions);
              setShowSessionPicker(true);
              setIsLoading(false);
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
      
      const sessionConfig = {
        type: 'create_session',
        workingDir,
        command: sessionType === 'main' ? 'claude' : (command || 'npm run dev'),
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
    setShowSessionPicker(false);
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
        
        // Optionally create a new session
        setTimeout(() => {
          createOrReconnectSession();
        }, 1000);
      } else {
        addLog(`Failed to close session: ${response.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      addLog(`Error closing session: ${err.message || err}`);
      setError('Failed to close session');
    }
  };

  const createNewSession = async () => {
    // Close any existing session first
    if (sessionId) {
      await closeSession();
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const wsClient = getWebSocketClient();
      if (!wsClient || !wsClient.isConnected()) {
        throw new Error('WebSocket not connected. Please refresh the page.');
      }

      // Get terminal dimensions
      let cols = 80;
      let rows = 24;
      
      if (terminalRef.current && typeof terminalRef.current.fit === 'function') {
        const container = document.querySelector('.xterm-screen');
        if (container) {
          const cellWidth = 9;
          const cellHeight = 17;
          cols = Math.floor(container.clientWidth / cellWidth) || 80;
          rows = Math.floor(container.clientHeight / cellHeight) || 24;
        }
      }
      
      const sessionConfig = {
        type: 'create_session',
        workingDir,
        command: sessionType === 'main' ? 'claude' : (command || 'npm run dev'),
        cols,
        rows
      };
      
      addLog(`Creating new session: ${JSON.stringify(sessionConfig)}`);
      
      const wsResponse = await sendMessage(sessionConfig as any);
      
      if (wsResponse.type === 'session_created') {
        setSessionId(wsResponse.sessionId);
        setStatus('connected');
        setIsLoading(false);
        addLog(`New session created! ID: ${wsResponse.sessionId}`);
        
        // Store session ID for reconnection
        const sessionStorageKey = `ccmanager_session_${projectId}_${sessionType}`;
        localStorage.setItem(sessionStorageKey, wsResponse.sessionId);
      } else if (wsResponse.type === 'error' || wsResponse.type === 'session_error') {
        throw new Error(wsResponse.error || 'Failed to create session');
      }
    } catch (err: any) {
      addLog(`Error creating new session: ${err.message || err}`);
      setError(err.message || 'Failed to create new session');
      setIsLoading(false);
    }
  };

  if (showSessionPicker && availableSessions.length > 0) {
    return (
      <div className="h-full bg-gray-900 p-4 overflow-hidden flex flex-col">
        <div className="max-w-2xl w-full mx-auto flex flex-col h-full">
          <h3 className="text-lg font-semibold text-white mb-4">
            Terminal Sessions
          </h3>
          <p className="text-gray-400 mb-6">
            {availableSessions.length === 1 
              ? 'You have 1 active session. You can create additional sessions or manage the existing one.'
              : `You have ${availableSessions.length} active sessions. Choose one to connect to or create a new one.`}
          </p>
          <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ minHeight: 0, maxHeight: 'calc(100vh - 300px)' }}>
            <div className="space-y-3 pr-2">
              {availableSessions.map((session) => (
              <div
                key={session.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => connectToSession(session.id)}
                  >
                    <p className="text-sm font-mono text-gray-300">{session.id}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Created: {new Date(session.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Last active: {new Date(session.lastActivity).toLocaleString()}
                    </p>
                    {session.id === sessionId && (
                      <p className="text-xs text-green-500 mt-1">Current session</p>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-xs text-gray-400">
                      PID: {session.pid}
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Close session ${session.id}?`)) {
                          try {
                            await sendMessage({
                              type: 'close_session',
                              sessionId: session.id
                            } as any);
                            // Refresh the session list
                            const response = await sendMessage({ type: 'list_sessions' } as any);
                            if (response.type === 'sessions_list') {
                              const projectSessions = response.sessions.filter((s: any) => 
                                s.workingDir === workingDir
                              );
                              setAvailableSessions(projectSessions);
                              if (projectSessions.length === 0) {
                                setShowSessionPicker(false);
                                createOrReconnectSession();
                              }
                            }
                          } catch (err) {
                            addLog(`Error closing session: ${err}`);
                          }
                        }
                      }}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Close this session"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={async () => {
                setShowSessionPicker(false);
                await createNewSession();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Session
            </button>
            <button
              onClick={() => {
                setShowSessionPicker(false);
                setAvailableSessions([]);
              }}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && !sessionId && !showSessionPicker) {
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

  return (
    <div className="h-full flex flex-col min-h-0 bg-white dark:bg-gray-900">
      {/* Header - matching Dev Server panel style */}
      <div className="px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
              {sessionType === 'main' ? 'Claude' : 'Dev Server'}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-green-500' :
                status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-400'
              }`} />
              <span className="text-xs text-gray-600 dark:text-gray-400 capitalize hidden sm:inline">
                {status === 'connected' ? 'Connected' : 
                 status === 'connecting' ? 'Connecting' : 
                 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Primary Actions */}
            {status === 'connected' && (
              <button
                onClick={sendInterrupt}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-600 text-white text-xs sm:text-sm rounded-md hover:bg-red-700 transition-colors"
                title="Send Ctrl+C interrupt signal"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
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
                  {status === 'connected' && (
                    <>
                      <button
                        onClick={async () => {
                          setShowActionsMenu(false);
                          try {
                            const response = await sendMessage({ type: 'list_sessions' } as any);
                            if (response.type === 'sessions_list') {
                              const projectSessions = response.sessions.filter((s: any) => 
                                s.workingDir === workingDir
                              );
                              if (projectSessions.length > 0) {
                                setAvailableSessions(projectSessions);
                                setShowSessionPicker(true);
                              } else {
                                // Show a message that no sessions exist
                                setError('No sessions found for this project');
                                setTimeout(() => setError(null), 3000);
                              }
                            }
                          } catch (err) {
                            addLog(`Error listing sessions: ${err}`);
                            setError('Failed to list sessions');
                            setTimeout(() => setError(null), 3000);
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        Switch Session
                      </button>
                      <button
                        onClick={async () => {
                          setShowActionsMenu(false);
                          // Create a new session without checking for existing ones
                          await createNewSession();
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
                      <div className="border-t border-gray-700 my-1"></div>
                    </>
                  )}
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
      <div className="flex-1 min-h-0 bg-gray-900">
        {sessionId && (
          <TerminalView
            ref={terminalRef}
            sessionId={sessionId}
            tabId={tabId}
            status={status}
            initialBuffer={sessionBuffer}
            addLog={addLog}
          />
        )}
      </div>
    </div>
  );
};

export default ProjectTerminalView;