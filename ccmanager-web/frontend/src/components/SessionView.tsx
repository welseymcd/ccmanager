import React, { useEffect, useState, useRef } from 'react';
import { Loader2, AlertCircle, Terminal as TerminalIcon } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { api } from '../api/client';

interface SessionViewProps {
  projectId: string;
  sessionType: 'main' | 'devserver';
  workingDir: string;
}

const SessionView: React.FC<SessionViewProps> = ({ projectId, sessionType, workingDir }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { 
    sessionHistory, 
    sessionStatus,
    setSessionHistory,
    appendSessionOutput,
    setSessionStatus 
  } = useSessionStore();

  // Create or reconnect to session
  useEffect(() => {
    createOrReconnectSession();
  }, [projectId, sessionType]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [sessionHistory[sessionId || '']]);

  const createOrReconnectSession = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // First, check if there's an existing session
      const sessionsResponse = await api.get(`/api/projects/${projectId}/sessions`);
      if (!sessionsResponse.ok) throw new Error('Failed to fetch sessions');
      
      const sessions = await sessionsResponse.json();
      const existingSession = sessions.find((s: any) => s.session_type === sessionType);
      
      if (existingSession && existingSession.session_status === 'active') {
        // Reconnect to existing session
        setSessionId(existingSession.session_id);
        setSessionStatus(existingSession.session_id, 'connected');
        
        // Load session history
        const historyResponse = await api.get(
          `/api/projects/${projectId}/sessions/${existingSession.session_id}/history`
        );
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          setSessionHistory(existingSession.session_id, history);
        }
      } else {
        // Create new session
        setIsConnecting(true);
        const createResponse = await api.post(`/api/projects/${projectId}/sessions`, {
          sessionType
        });
        
        if (!createResponse.ok) throw new Error('Failed to create session');
        
        const newSession = await createResponse.json();
        setSessionId(newSession.id);
        setSessionStatus(newSession.id, 'connecting');
        
        // Initialize session with working directory
        setTimeout(() => {
          setSessionStatus(newSession.id, 'connected');
          setIsConnecting(false);
          appendSessionOutput(newSession.id, {
            lineNumber: 1,
            content: `Connected to Claude session in ${workingDir}`,
            type: 'system',
            timestamp: new Date().toISOString()
          });
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message);
      setSessionStatus(sessionId || '', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sendCommand = async () => {
    if (!commandInput.trim() || !sessionId) return;
    
    const command = commandInput.trim();
    setCommandInput('');
    
    // Add command to history
    appendSessionOutput(sessionId, {
      lineNumber: (sessionHistory[sessionId]?.length || 0) + 1,
      content: `> ${command}`,
      type: 'input',
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await api.post(`/api/projects/${projectId}/sessions/${sessionId}/command`, {
        command
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // If session not found, recreate it
        if (response.status === 404 && errorData.code === 'SESSION_NOT_FOUND') {
          appendSessionOutput(sessionId, {
            lineNumber: (sessionHistory[sessionId]?.length || 0) + 1,
            content: 'Session disconnected. Reconnecting...',
            type: 'system',
            timestamp: new Date().toISOString()
          });
          
          // Store the command to retry
          const commandToRetry = command;
          
          // Recreate the session (this will update sessionId state)
          await createOrReconnectSession();
          
          // Wait for state update and retry with new session
          setTimeout(async () => {
            const currentSessionId = sessionId; // Get the latest session ID
            if (currentSessionId) {
              try {
                await api.post(`/api/projects/${projectId}/sessions/${currentSessionId}/command`, {
                  command: commandToRetry
                });
              } catch (retryError: any) {
                appendSessionOutput(currentSessionId, {
                  lineNumber: (sessionHistory[currentSessionId]?.length || 0) + 1,
                  content: `Error retrying command: ${retryError.message}`,
                  type: 'system',
                  timestamp: new Date().toISOString()
                });
              }
            }
          }, 1000);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to send command');
      }
      
      // Simulate response (in real app, this would come via WebSocket)
      setTimeout(() => {
        appendSessionOutput(sessionId, {
          lineNumber: (sessionHistory[sessionId]?.length || 0) + 1,
          content: 'Command sent to Claude. Response will appear here...',
          type: 'output',
          timestamp: new Date().toISOString()
        });
      }, 500);
    } catch (err: any) {
      appendSessionOutput(sessionId, {
        lineNumber: (sessionHistory[sessionId]?.length || 0) + 1,
        content: `Error: ${err.message}`,
        type: 'system',
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand();
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Initializing session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Session Error
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={createOrReconnectSession}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const history = sessionHistory[sessionId || ''] || [];
  const status = sessionStatus[sessionId || ''] || 'disconnected';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Claude Session
          </span>
          <span className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-green-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          {workingDir}
        </span>
      </div>

      {/* Output Area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-900 text-gray-100"
      >
        {history.length === 0 && !isConnecting ? (
          <div className="text-gray-500 dark:text-gray-400">
            <p>Welcome to Claude Code session.</p>
            <p>Type your commands below and press Enter to send.</p>
          </div>
        ) : (
          history.map((line, index) => (
            <div
              key={index}
              className={`mb-1 ${
                line.type === 'input' ? 'text-blue-400' :
                line.type === 'system' ? 'text-yellow-400' :
                'text-gray-100'
              }`}
            >
              <pre className="whitespace-pre-wrap">{line.content}</pre>
            </div>
          ))
        )}
        {isConnecting && (
          <div className="text-yellow-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting to Claude...
          </div>
        )}
      </div>

      {/* Command Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            disabled={status !== 'connected'}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
          />
          <button
            onClick={sendCommand}
            disabled={status !== 'connected' || !commandInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        {status !== 'connected' && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {status === 'connecting' ? 'Connecting to session...' : 'Session disconnected'}
          </p>
        )}
      </div>
    </div>
  );
};

export default SessionView;