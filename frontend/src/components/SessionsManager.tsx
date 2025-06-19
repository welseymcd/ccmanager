import React, { useState, useEffect } from 'react';
import { Terminal, Clock, Activity, AlertCircle, Plus, Trash2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

interface Session {
  id: string;
  workingDir: string;
  command: string;
  createdAt: string;
  lastActivity: string;
  pid: number;
  state: 'idle' | 'running' | 'crashed';
}

interface SessionsManagerProps {
  projectId: string;
  workingDir: string;
  onSelectSession: (sessionId: string) => void;
  currentSessionId?: string | null;
}

export const SessionsManager: React.FC<SessionsManagerProps> = ({
  projectId,
  workingDir,
  onSelectSession,
  currentSessionId
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { sendMessage, isConnected } = useWebSocket();

  // Fetch sessions
  const fetchSessions = async () => {
    if (!isConnected) return;
    
    try {
      setIsLoading(true);
      const response = await sendMessage({
        type: 'list_sessions'
      } as any);
      
      if (response.type === 'sessions_list') {
        console.log('[SessionsManager] Raw sessions:', response.sessions);
        console.log('[SessionsManager] Working dir filter:', workingDir);
        
        // Filter sessions for this project's working directory
        const projectSessions = response.sessions.filter((s: any) => {
          console.log('[SessionsManager] Session workingDir:', s.workingDir, 'Match:', s.workingDir === workingDir);
          return s.workingDir === workingDir;
        });
        
        console.log('[SessionsManager] Filtered sessions:', projectSessions);
        setSessions(projectSessions);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  };

  // Create new session
  const createNewSession = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    setError(null);
    
    try {
      const response = await sendMessage({
        type: 'create_session',
        workingDir,
        command: 'claude',
        cols: 80,
        rows: 24
      } as any);
      
      if (response.type === 'session_created') {
        // Refresh sessions list
        await fetchSessions();
        // Auto-select the new session
        onSelectSession(response.sessionId);
      } else if (response.type === 'session_error') {
        setError(response.error || 'Failed to create session');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete session
  const deleteSession = async (sessionId: string) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to close this session? This will terminate the process.'
    );
    
    if (!confirmDelete) return;
    
    try {
      await sendMessage({
        type: 'close_session',
        sessionId
      } as any);
      
      // Refresh sessions list
      await fetchSessions();
      
      // If we deleted the current session, clear selection
      if (sessionId === currentSessionId) {
        onSelectSession('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to close session');
    }
  };

  // Get session status icon
  const getStatusIcon = (session: Session) => {
    switch (session.state) {
      case 'running':
        return <Activity className="w-4 h-4 text-green-500" />;
      case 'idle':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'crashed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  // Get session status color
  const getStatusColor = (session: Session) => {
    switch (session.state) {
      case 'running':
        return 'text-green-500';
      case 'idle':
        return 'text-blue-500';
      case 'crashed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  useEffect(() => {
    if (isConnected) {
      fetchSessions();
      // Refresh every 30 seconds
      const interval = setInterval(fetchSessions, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, workingDir]);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2">Loading sessions...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Terminal Sessions
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSessions}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="Refresh sessions"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={createNewSession}
              disabled={isCreating}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No active sessions</p>
            <p className="text-xs mt-1">Create a new session to get started</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                currentSessionId === session.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(session)}
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {session.id.substring(0, 16)}...
                    </span>
                    {currentSessionId === session.id && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mt-2">
                    <div className="flex items-center gap-1">
                      <Terminal className="w-3 h-3" />
                      <span className="font-mono">{session.command}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`${getStatusColor(session)} font-medium`}>
                        {session.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Created {formatDistanceToNow(new Date(session.createdAt))} ago</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      <span>Active {formatDistanceToNow(new Date(session.lastActivity))} ago</span>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-500 font-mono truncate">
                    PID: {session.pid} • {session.workingDir}
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  className="ml-2 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  title="Close session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      
      {sessions.length > 0 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 text-xs text-gray-600 dark:text-gray-400 text-center">
          {sessions.length} active session{sessions.length !== 1 ? 's' : ''} • Click to connect
        </div>
      )}
    </div>
  );
};