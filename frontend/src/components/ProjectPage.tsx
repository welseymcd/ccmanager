import React, { useEffect, useState } from 'react';
import { Terminal, Server, Menu, ArrowLeft, Plus, X } from 'lucide-react';
import { useParams, Link } from '@tanstack/react-router';
import { useSessionStore } from '../stores/sessionStore';
import { useTabStore } from '../stores/tabStore';
import { useUIStore } from '../stores/uiStore';
import { useUpdateProjectAccess } from '../hooks/useProjects';
import { useProjects } from '../hooks/useProjects';
import { useWebSocket } from '../hooks/useWebSocket';
import ProjectSidebar from './ProjectSidebar';
import ProjectTerminalView from './ProjectTerminalView';
import DevServerPanel from './DevServerPanel';

const ProjectPage: React.FC = () => {
  const { projectId } = useParams({ from: '/_authenticated/projects/$projectId' });
  const { data: projects } = useProjects();
  const currentProject = projects?.find(p => p.id === projectId);
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    clearActiveTab,
    removeTab
  } = useSessionStore();
  const { tabs: dynamicTabs, activeTabId: activeDynamicTabId, setActiveTab: setActiveDynamicTab, createTab, deduplicateTabs } = useTabStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { sendMessage, isConnected } = useWebSocket();
  
  // Get tabs for current project
  const projectTabs = tabs.filter(tab => tab.projectId === projectId);
  const activeTab = projectTabs.find(tab => tab.id === activeTabId);
  
  const updateAccess = useUpdateProjectAccess();
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Handle legacy orphan tab closing
  const handleCloseOrphanTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTab(tabId);
    
    // If we're closing the active tab, switch to another tab
    if (tabId === activeTabId) {
      const remainingTabs = projectTabs.filter(t => t.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[0].id);
      } else {
        // Switch to first dynamic tab if available
        if (dynamicTabs.length > 0) {
          setActiveDynamicTab(dynamicTabs[0].id);
        }
        clearActiveTab();
      }
    }
  };

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarWidth(window.innerWidth);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync existing sessions as tabs
  const syncExistingSessions = async () => {
    if (!isConnected || !currentProject) return;
    
    try {
      const response = await sendMessage({ type: 'list_sessions' } as any);
      
      if (response.type === 'sessions_list') {
        // Filter sessions for this project
        const projectSessions = response.sessions.filter((s: any) => 
          s.workingDir === currentProject.workingDir
        );
        
        // Group sessions by type
        let hasClaudeSession = false;
        let hasDevServerSession = false;
        const orphanSessions: any[] = [];
        
        projectSessions.forEach((session: any) => {
          if (session.command === 'claude' || session.command.includes('--dangerously-skip-permissions')) {
            hasClaudeSession = true;
          } else if (session.command.includes('npm run dev') || session.command === currentProject.devServerCommand) {
            hasDevServerSession = true;
          } else {
            orphanSessions.push(session);
          }
        });
        
        // Only create Claude tab if there's no existing Claude tab AND no Claude session
        const claudeTab = dynamicTabs.find(tab => 
          tab.workingDir === currentProject.workingDir && 
          tab.title === 'Claude Session'
        );
        if (!claudeTab && !hasClaudeSession) {
          createTab({
            workingDir: currentProject.workingDir,
            title: 'Claude Session'
          });
        }
        
        // Only create Dev Server tab if there's no existing Dev Server tab AND no Dev Server session
        const devServerTab = dynamicTabs.find(tab => 
          tab.workingDir === currentProject.workingDir && 
          tab.title === 'Dev Server'
        );
        if (!devServerTab && !hasDevServerSession && currentProject.devServerCommand) {
          createTab({
            workingDir: currentProject.workingDir,
            title: 'Dev Server'
          });
        }
        
        // Create tabs for orphan sessions that don't have tabs yet
        orphanSessions.forEach((session: any) => {
          const existingTab = dynamicTabs.find(tab => 
            tab.sessionId === session.id || 
            (tab.workingDir === session.workingDir && tab.title === 'Terminal')
          );
          
          if (!existingTab) {
            createTab({
              workingDir: session.workingDir,
              title: 'Terminal'
            });
          }
        });
        
        // After syncing, deduplicate tabs to remove any duplicates
        deduplicateTabs();
      }
    } catch (err) {
      console.error('Failed to sync sessions:', err);
    }
  };

  useEffect(() => {
    if (currentProject) {
      updateAccess.mutate(currentProject.id);
      
      // Sync existing sessions from server - this will handle tab creation intelligently
      syncExistingSessions();
      
      // If no tab is active after sync, activate the first one
      setTimeout(() => {
        if (!activeDynamicTabId && dynamicTabs.length > 0) {
          setActiveDynamicTab(dynamicTabs[0].id);
        }
      }, 100);
    }
  }, [currentProject?.id, isConnected]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Handle loading state
  if (!projects) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  // Handle project not found
  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Project not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Projects
          </Link>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">{currentProject.name}</span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-900 relative">
        {/* Mobile Sidebar Overlay */}
        {isMobile && mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        {(!sidebarCollapsed || (isMobile && mobileMenuOpen)) && (
          <div
            className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300 ${
              isMobile ? 'fixed inset-y-0 left-0 z-50' : ''
            }`}
            style={{ width: isMobile ? '80%' : `${sidebarWidth}px`, maxWidth: isMobile ? '320px' : 'none' }}
          >
            <ProjectSidebar project={currentProject} />
          </div>
        )}

        {/* Resize Handle - Desktop only */}
        {!sidebarCollapsed && !isMobile && (
          <div
            className="w-1 cursor-col-resize hover:bg-blue-500 transition-colors hidden md:block"
            onMouseDown={handleMouseDown}
          />
        )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col">
          {/* Custom Tab Bar */}
          <div className="flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {/* Sidebar Toggle */}
            <button
              onClick={isMobile ? () => setMobileMenuOpen(!mobileMenuOpen) : toggleSidebar}
              className="flex-shrink-0 px-3 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={isMobile ? "Toggle menu" : (sidebarCollapsed ? "Show sidebar" : "Hide sidebar")}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 my-auto" />
            

            {/* Legacy Orphan Tabs - will be phased out */}
            {projectTabs.filter(tab => tab.sessionType === 'orphan').map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 md:gap-2 text-xs md:text-sm font-medium transition-colors border-b-2 group ${
                  tab.id === activeTabId
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-3 flex-1"
                >
                  <Terminal className="w-4 h-4" />
                  <span className="hidden sm:inline truncate max-w-32">{tab.title}</span>
                  <span className="sm:hidden truncate max-w-16">{tab.title}</span>
                  {tab.isConnected && (
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>
                <button
                  onClick={(e) => handleCloseOrphanTab(tab.id, e)}
                  className="ml-1 p-0.5 px-2 py-3 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Dynamic Tabs from TabStore */}
            {dynamicTabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 md:gap-2 text-xs md:text-sm font-medium transition-colors border-b-2 group ${
                  tab.id === activeDynamicTabId
                    ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <button
                  onClick={() => setActiveDynamicTab(tab.id)}
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-3 flex-1"
                >
                  {tab.title === 'Dev Server' ? <Server className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                  <span className="hidden sm:inline truncate max-w-32">{tab.title}</span>
                  <span className="sm:hidden truncate max-w-16">{tab.title}</span>
                  {tab.status === 'connected' && (
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                  )}
                  {tab.status === 'connecting' && (
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  )}
                  {tab.status === 'error' && (
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const { closeTab } = useTabStore.getState();
                    closeTab(tab.id);
                  }}
                  className="ml-1 p-0.5 px-2 py-3 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add New Tab Button */}
            <button
              onClick={() => {
                createTab({
                  workingDir: currentProject.workingDir,
                  title: 'Terminal'
                });
              }}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Add terminal tab"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline text-xs">New Tab</span>
            </button>
            
            {/* Show cleanup button only if there are duplicate tabs */}
            {dynamicTabs.length > new Set(dynamicTabs.map(t => `${t.workingDir}:${t.title}`)).size && (
              <>
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 my-auto" />
                <button
                  onClick={() => {
                    deduplicateTabs();
                  }}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-3 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                  title="Remove duplicate tabs"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden md:inline text-xs">Clean Duplicates</span>
                </button>
              </>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0">
            {activeDynamicTabId && dynamicTabs.find(tab => tab.id === activeDynamicTabId) && (() => {
              const activeTab = dynamicTabs.find(tab => tab.id === activeDynamicTabId)!;
              
              // Determine session type based on tab title
              if (activeTab.title === 'Claude Session') {
                return (
                  <ProjectTerminalView
                    key={activeTab.id}
                    projectId={currentProject.id}
                    sessionType="main"
                    workingDir={activeTab.workingDir}
                    orphanTabId={activeTab.id}
                  />
                );
              } else if (activeTab.title === 'Dev Server') {
                return (
                  <DevServerPanel
                    key={activeTab.id}
                    projectId={currentProject.id}
                    command={currentProject.devServerCommand}
                    port={currentProject.devServerPort}
                    workingDir={activeTab.workingDir}
                  />
                );
              } else {
                // Regular terminal tab
                return (
                  <ProjectTerminalView
                    key={activeTab.id}
                    projectId={currentProject.id}
                    sessionType="orphan"
                    workingDir={activeTab.workingDir}
                    orphanTabId={activeTab.id}
                  />
                );
              }
            })()}
            
            {/* Legacy support for orphan tabs from sessionStore */}
            {!activeDynamicTabId && activeTab && activeTab.sessionType === 'orphan' && (
              <ProjectTerminalView
                key={activeTab.id}
                projectId={currentProject.id}
                sessionType="orphan"
                workingDir={currentProject.workingDir}
                orphanTabId={activeTab.id}
              />
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ProjectPage;