import React, { useEffect, useState } from 'react';
import { Terminal, Server, Menu, ArrowLeft } from 'lucide-react';
import { useParams, Link } from '@tanstack/react-router';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { useUpdateProjectAccess } from '../hooks/useProjects';
import { useProjects } from '../hooks/useProjects';
import ProjectSidebar from './ProjectSidebar';
import ProjectTerminalView from './ProjectTerminalView';
import DevServerPanel from './DevServerPanel';
import * as Tabs from '@radix-ui/react-tabs';

const ProjectPage: React.FC = () => {
  const { projectId } = useParams({ from: '/_authenticated/projects/$projectId' });
  const { data: projects } = useProjects();
  const currentProject = projects?.find(p => p.id === projectId);
  const { activeProjectSessionType, setActiveSessionType } = useSessionStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const updateAccess = useUpdateProjectAccess();
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

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
      <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        {!sidebarCollapsed && (
        <div
          className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300"
          style={{ width: `${sidebarWidth}px` }}
        >
          <ProjectSidebar project={currentProject} />
        </div>
      )}

      {/* Resize Handle */}
      {!sidebarCollapsed && (
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Tabs.Root
          value={activeProjectSessionType}
          onValueChange={(value) => setActiveSessionType(value as 'main' | 'devserver')}
          className="flex-1 flex flex-col"
        >
          {/* Tabs */}
          <Tabs.List className="flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={toggleSidebar}
              className="px-3 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 my-auto" />
            <Tabs.Trigger
              value="main"
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-colors"
            >
              <Terminal className="w-4 h-4" />
              Claude Session
              {currentProject.hasActiveMainSession && (
                <span className="w-2 h-2 bg-green-500 rounded-full" />
              )}
            </Tabs.Trigger>
            
            <Tabs.Trigger
              value="devserver"
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-colors"
            >
              <Server className="w-4 h-4" />
              Dev Server
              {currentProject.hasActiveDevSession && (
                <span className="w-2 h-2 bg-green-500 rounded-full" />
              )}
            </Tabs.Trigger>
          </Tabs.List>

          {/* Tab Panels */}
          <Tabs.Content value="main" className="flex-1 min-h-0">
            <ProjectTerminalView
              projectId={currentProject.id}
              sessionType="main"
              workingDir={currentProject.workingDir}
            />
          </Tabs.Content>

          <Tabs.Content value="devserver" className="flex-1 min-h-0">
            <DevServerPanel
              projectId={currentProject.id}
              command={currentProject.devServerCommand}
              port={currentProject.devServerPort}
              workingDir={currentProject.workingDir}
            />
          </Tabs.Content>
        </Tabs.Root>
      </div>
      </div>
    </div>
  );
};

export default ProjectPage;