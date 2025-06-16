import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Login } from './components/Login'
import ProjectDashboard from './components/ProjectDashboard'
import ProjectPage from './components/ProjectPage'
import { useTabShortcuts } from './hooks/useTabShortcuts'
import { useTabStore } from './stores/tabStore'
import { useProjectStore } from './stores/projectStore'
import { getWebSocketClient } from './services/websocket'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  
  useTabShortcuts();
  const { tabs, createTab } = useTabStore();
  const { isProjectDashboard, currentProject } = useProjectStore();

  // Check for existing authentication
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        try {
          // Verify token with backend
          const response = await fetch('/api/auth/validate', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            setIsAuthenticated(true);
            // Initialize WebSocket connection with auth token
            const wsClient = getWebSocketClient();
            wsClient.connect(token);
          } else {
            // Token is invalid, remove it
            localStorage.removeItem('auth_token');
            setAuthError('Session expired. Please login again.');
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          setAuthError('Failed to verify authentication.');
        }
      }
      
      setIsCheckingAuth(false);
    };

    checkAuth();
  }, []);

  // Create default tab when authenticated and not in project dashboard
  useEffect(() => {
    if (isAuthenticated && tabs.length === 0 && !isProjectDashboard) {
      console.log('Creating default tab');
      createTab({ workingDir: '~', title: 'Home' });
    }
  }, [isAuthenticated, tabs.length, createTab, isProjectDashboard]);

  const handleLogin = (token: string) => {
    setIsAuthenticated(true);
    setAuthError('');
    
    // Initialize WebSocket connection with auth token
    const wsClient = getWebSocketClient();
    wsClient.connect(token);
  };

  const handleLogout = () => {
    // Clear auth token
    localStorage.removeItem('auth_token');
    
    // Disconnect WebSocket
    const wsClient = getWebSocketClient();
    wsClient.disconnect();
    
    // Reset state
    setIsAuthenticated(false);
    
    // Clear tabs
    const { clearTabs } = useTabStore.getState();
    clearTabs();
    
    // Reset to project dashboard
    const { setCurrentProject } = useProjectStore.getState();
    setCurrentProject(null);
  };

  const handleBackToProjects = () => {
    const { setCurrentProject } = useProjectStore.getState();
    setCurrentProject(null);
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} error={authError} />;
  }

  // Show project dashboard if no project selected
  if (isProjectDashboard) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <ProjectDashboard onLogout={handleLogout} />
      </div>
    );
  }

  // Show project page when authenticated with project selected
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToProjects}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            ← Projects
          </button>
          {currentProject && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{currentProject.name}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        >
          Logout
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ProjectPage />
      </div>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App