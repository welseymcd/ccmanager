import React, { useEffect, useState } from 'react';
import { Terminal, Server, Menu, ArrowLeft, Plus, X } from 'lucide-react';
import { useParams, Link } from '@tanstack/react-router';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { useUpdateProjectAccess } from '../hooks/useProjects';
import { useProjects } from '../hooks/useProjects';
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
    createOrphanTab, 
    removeTab,
    activeProjectSessionType, 
    setActiveSessionType 
  } = useSessionStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  
  // Get tabs for current project
  const projectTabs = tabs.filter(tab => tab.projectId === projectId);
  const activeTab = projectTabs.find(tab => tab.id === activeTabId);
  
  // Determine the active session type - for backward compatibility with fixed tabs
  const currentActiveType = activeTab?.sessionType || activeProjectSessionType;
  const updateAccess = useUpdateProjectAccess();
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Handle tab creation and management
  const handleCreateOrphanTab = () => {
    if (currentProject) {
      const tabId = createOrphanTab(currentProject.id);
      setActiveTab(tabId);
    }
  };

  const handleTabClick = (tabType: 'main' | 'devserver', tabId?: string) => {
    if (tabId) {
      setActiveTab(tabId);
    } else {
      // For backward compatibility with fixed tabs
      setActiveSessionType(tabType);
    }
  };

  const handleCloseOrphanTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTab(tabId);
    
    // If we're closing the active tab, switch to another tab
    if (tabId === activeTabId) {
      const remainingTabs = projectTabs.filter(t => t.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[0].id);
      } else {
        // Fall back to main session type
        setActiveSessionType('main');
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

  useEffect(() => {
    if (currentProject) {
      updateAccess.mutate(currentProject.id);
    }
  }, [currentProject?.id]);

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
            
            {/* Fixed Tabs */}
            <button
              onClick={() => handleTabClick('main')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-3 text-xs md:text-sm font-medium transition-colors border-b-2 ${
                currentActiveType === 'main' && !activeTab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span className="hidden sm:inline">Claude Session</span>
              <span className="sm:hidden">Claude</span>
              {currentProject.hasActiveMainSession && (
                <span className="w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>
            
            <button
              onClick={() => handleTabClick('devserver')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-3 text-xs md:text-sm font-medium transition-colors border-b-2 ${
                currentActiveType === 'devserver' && !activeTab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">Dev Server</span>
              <span className="sm:hidden">Dev</span>
              {currentProject.hasActiveDevSession && (
                <span className="w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>

            {/* Orphan Tabs */}
            {projectTabs.filter(tab => tab.sessionType === 'orphan').map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-3 text-xs md:text-sm font-medium transition-colors border-b-2 group ${
                  tab.id === activeTabId
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span className="hidden sm:inline truncate max-w-32">{tab.title}</span>
                <span className="sm:hidden truncate max-w-16">{tab.title}</span>
                {tab.isConnected && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                )}
                <button
                  onClick={(e) => handleCloseOrphanTab(tab.id, e)}
                  className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
            ))}

            {/* Add Orphan Tab Button */}
            <button
              onClick={handleCreateOrphanTab}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Add terminal tab"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline text-xs">Terminal</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0">
            {/* Main Tab */}
            {currentActiveType === 'main' && !activeTab && (
              <ProjectTerminalView
                projectId={currentProject.id}
                sessionType="main"
                workingDir={currentProject.workingDir}
              />
            )}

            {/* Dev Server Tab */}
            {currentActiveType === 'devserver' && !activeTab && (
              <DevServerPanel
                projectId={currentProject.id}
                command={currentProject.devServerCommand}
                port={currentProject.devServerPort}
                workingDir={currentProject.workingDir}
              />
            )}

            {/* Orphan Tabs */}
            {activeTab && activeTab.sessionType === 'orphan' && (
              <ProjectTerminalView
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