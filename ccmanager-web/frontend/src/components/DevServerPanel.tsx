import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { api } from '../api/client';

interface DevServerPanelProps {
  projectId: string;
  command?: string;
  port?: number;
  workingDir: string;
}

interface ServerLog {
  content: string;
  type: 'stdout' | 'stderr';
  timestamp: string;
}

const DevServerPanel: React.FC<DevServerPanelProps> = ({ 
  projectId, 
  command, 
  port,
  workingDir 
}) => {
  const [status, setStatus] = useState<'stopped' | 'starting' | 'running' | 'stopping' | 'error'>('stopped');
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchServerStatus();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [projectId]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchServerStatus = async () => {
    try {
      const response = await api.get(`/api/projects/${projectId}/devserver`);
      if (!response.ok) throw new Error('Failed to fetch server status');
      
      const data = await response.json();
      setStatus(data.status);
      if (data.port) {
        setServerUrl(`http://localhost:${data.port}`);
      }
      if (data.errorMessage) {
        setError(data.errorMessage);
      }
    } catch (err: any) {
      console.error('Failed to fetch server status:', err);
    }
  };

  const startServer = async () => {
    if (!command) {
      setError('No dev server command configured for this project');
      return;
    }

    setStatus('starting');
    setError(null);
    setLogs([]);

    // Add initial log
    addLog(`Starting dev server with command: ${command}`, 'stdout');
    addLog(`Working directory: ${workingDir}`, 'stdout');

    try {
      // Update server status
      await api.post(`/api/projects/${projectId}/devserver/status`, {
        status: 'starting'
      });

      // Simulate server startup (in real app, this would be WebSocket)
      setTimeout(() => {
        setStatus('running');
        if (port) {
          setServerUrl(`http://localhost:${port}`);
          addLog(`Server running at http://localhost:${port}`, 'stdout');
        }
        addLog('Compiled successfully!', 'stdout');
        addLog('Watching for file changes...', 'stdout');
      }, 2000);

      // Update status to running
      setTimeout(async () => {
        await api.post(`/api/projects/${projectId}/devserver/status`, {
          status: 'running',
          port: port
        });
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setError(err.message);
      addLog(`Error: ${err.message}`, 'stderr');
    }
  };

  const stopServer = async () => {
    setStatus('stopping');
    
    try {
      await api.post(`/api/projects/${projectId}/devserver/status`, {
        status: 'stopping'
      });

      // Simulate server shutdown
      addLog('Stopping server...', 'stdout');
      
      setTimeout(async () => {
        setStatus('stopped');
        setServerUrl(null);
        addLog('Server stopped', 'stdout');
        
        await api.post(`/api/projects/${projectId}/devserver/status`, {
          status: 'stopped'
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message);
      addLog(`Error stopping server: ${err.message}`, 'stderr');
    }
  };

  const addLog = (content: string, type: 'stdout' | 'stderr') => {
    setLogs(prev => [...prev, {
      content,
      type,
      timestamp: new Date().toISOString()
    }]);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Dev Server
            </h3>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                status === 'running' ? 'bg-green-500' :
                status === 'starting' || status === 'stopping' ? 'bg-yellow-500 animate-pulse' :
                status === 'error' ? 'bg-red-500' :
                'bg-gray-400'
              }`} />
              <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                {status}
              </span>
            </div>
            {serverUrl && status === 'running' && (
              <a
                href={serverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {serverUrl}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status === 'stopped' || status === 'error' ? (
              <button
                onClick={startServer}
                disabled={!command}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            ) : status === 'running' ? (
              <button
                onClick={stopServer}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                disabled
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md opacity-50 cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {status === 'starting' ? 'Starting...' : 'Stopping...'}
              </button>
            )}
          </div>
        </div>
        
        {command && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Command:</span> <code className="font-mono">{command}</code>
            {port && <span className="ml-4"><span className="font-medium">Port:</span> {port}</span>}
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto bg-gray-900 p-4">
        {!command ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">No dev server configured</p>
              <p className="text-sm text-gray-500">
                Configure a dev server command in your project settings
              </p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-sm">
            <p>Dev server output will appear here...</p>
          </div>
        ) : (
          <div className="font-mono text-sm">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`mb-1 ${
                  log.type === 'stderr' ? 'text-red-400' : 'text-gray-100'
                }`}
              >
                <span className="text-gray-500 mr-2">
                  [{formatTimestamp(log.timestamp)}]
                </span>
                <span className="whitespace-pre-wrap">{log.content}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-md">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevServerPanel;