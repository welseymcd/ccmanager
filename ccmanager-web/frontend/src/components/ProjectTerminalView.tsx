import React, { useEffect, useState, useRef } from 'react';
import { Loader2, AlertCircle, Terminal as TerminalIcon, Square, X, MoreVertical } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { useWebSocket } from '../hooks/useWebSocket';
import { getWebSocketClient } from '../services/websocket';

interface ProjectTerminalViewProps {
  projectId: string;
  sessionType: 'main' | 'devserver';
  workingDir: string;
}

const ProjectTerminalView: React.FC<ProjectTerminalViewProps> = ({ 
  projectId, 
  sessionType, 
  workingDir 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const [sessionBuffer, setSessionBuffer] = useState<string | undefined>();
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const terminalRef = useRef<any>(null);
  const isCreatingSession = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    addLog(`Component mounted - WebSocket connected: ${isConnected}`);
    addLog(`Project ID: ${projectId}, Session Type: ${sessionType}`);
    addLog(`Working Directory: ${workingDir}`);
    
    // Check auth token
    const authToken = localStorage.getItem('auth_token');
    addLog(`Auth token present: ${!!authToken}`);
    
    if (!authToken) {
      addLog('ERROR: No auth token found. User needs to log in.');
      setError('Not authenticated. Please log in again.');
      setStatus('error');
      setIsLoading(false);
      return;
    }
    
    if (isConnected) {
      addLog('WebSocket is connected, creating session...');
      createOrReconnectSession();
    } else {
      addLog('WebSocket not connected yet, waiting...');
      addLog(`Client object exists: ${!!client}`);
      
      // Always get the WebSocket client instance
      const wsClient = getWebSocketClient();
      addLog(`WebSocket client instance obtained: ${!!wsClient}`);
      addLog(`WebSocket client connected state: ${wsClient.isConnected()}`);
      
      if (!wsClient.isConnected()) {
        addLog('Attempting to connect WebSocket with auth token...');
        wsClient.connect(authToken).then(() => {
          addLog('WebSocket connect() promise resolved successfully!');
        }).catch((err: any) => {
          addLog(`WebSocket connection failed: ${err.message || err}`);
          if (err.stack) {
            addLog(`Error stack: ${err.stack}`);
          }
        });
      } else {
        addLog('WebSocket already connected!');
      }
    }
  }, [projectId, sessionType, isConnected]);

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
        const listResponse = await sendMessage({
          type: 'list_sessions'
        } as any);
        
        if (listResponse.type === 'sessions_list' && listResponse.sessions.length > 0) {
          // Filter sessions by working directory and command type
          const projectSessions = listResponse.sessions.filter((s: any) => {
            const isCorrectDir = s.workingDir === workingDir;
            const isCorrectType = sessionType === 'main' 
              ? s.command === 'claude' || s.command.includes('--dangerously-skip-permissions')
              : s.command.includes('npm run dev');
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
      if (!client) {
        addLog('ERROR: WebSocket client not available');
        throw new Error('WebSocket not connected. Please refresh the page.');
      }

      const sessionConfig = {
        type: 'create_session',
        workingDir,
        command: sessionType === 'main' ? 'claude' : 'npm run dev'
      };
      
      addLog(`Sending create_session message: ${JSON.stringify(sessionConfig)}`);
      
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
    setSessionId(sessionIdToConnect);
    setStatus('connected');
    setIsLoading(false);
    setShowSessionPicker(false);
    
    // Store in localStorage for faster reconnection
    localStorage.setItem(sessionStorageKey, sessionIdToConnect);
    
    // Request session buffer to restore terminal state
    try {
      const bufferResponse = await sendMessage({
        type: 'get_session_buffer',
        sessionId: sessionIdToConnect
      } as any);
      
      if (bufferResponse.type === 'session_buffer' && bufferResponse.buffer) {
        addLog(`Restored session buffer (${bufferResponse.buffer.length} bytes)`);
        setSessionBuffer(bufferResponse.buffer);
      }
    } catch (err) {
      addLog(`Could not restore session buffer: ${err}`);
    }
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

  if (showSessionPicker && availableSessions.length > 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-2xl w-full">
          <h3 className="text-lg font-semibold text-white mb-4">
            Multiple active sessions found
          </h3>
          <p className="text-gray-400 mb-6">
            Choose which session to reconnect to:
          </p>
          <div className="space-y-3">
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
          <button
            onClick={() => {
              setShowSessionPicker(false);
              setAvailableSessions([]);
              createOrReconnectSession();
            }}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create New Session Instead
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !sessionId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-400">Initializing {sessionType} session...</p>
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
    <div className="h-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Status Bar */}
      <div className="px-2 sm:px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TerminalIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-300 font-medium">
            {sessionType === 'main' ? 'Claude' : 'Dev Server'}
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            status === 'connected' ? 'bg-green-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          {/* Working Directory - only on larger screens */}
          <span className="text-xs text-gray-500 font-mono hidden md:block truncate" title={workingDir}>
            {workingDir}
          </span>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Primary Actions */}
          {status === 'connected' && (
            <button
              onClick={sendInterrupt}
              className="flex items-center justify-center px-3 py-1.5 text-sm font-medium text-red-400 bg-red-950 border border-red-800 rounded hover:bg-red-900 hover:text-red-300 transition-colors"
              title="Send Ctrl+C interrupt signal"
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}
          
          {/* Dropdown Menu for Secondary Actions */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 hover:border-gray-500 transition-colors"
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
                          const response = await sendMessage({ type: 'list_sessions' } as any);
                          if (response.type === 'sessions_list') {
                            const projectSessions = response.sessions.filter((s: any) => 
                              s.workingDir === workingDir
                            );
                            if (projectSessions.length > 1) {
                              setAvailableSessions(projectSessions);
                              setShowSessionPicker(true);
                            } else {
                              addLog('No other sessions available for this project');
                            }
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        Switch Session
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

      {/* Debug Log Panel */}
      {showDebugLog && (
        <div className="bg-gray-800 border-b border-gray-700 p-4 max-h-48 overflow-y-auto overflow-x-hidden">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Debug Log</h3>
            <button
              onClick={() => setDebugLogs([])}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="text-xs font-mono text-gray-400 space-y-1 overflow-x-hidden">
            {debugLogs.length === 0 ? (
              <div>No logs yet...</div>
            ) : (
              debugLogs.map((log, index) => (
                <div key={index} className="break-words">
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
      <div className="flex-1 overflow-hidden">
        <TerminalView
          ref={terminalRef}
          sessionId={sessionId}
          tabId={tabId}
          status={status}
          initialBuffer={sessionBuffer}
        />
      </div>
    </div>
  );
};

export default ProjectTerminalView;