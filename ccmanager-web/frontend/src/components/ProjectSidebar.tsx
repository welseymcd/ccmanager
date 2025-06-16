import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ExternalLink, FolderOpen, Terminal } from 'lucide-react';
import { Project } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import TaskList from './TaskList';

interface ProjectSidebarProps {
  project: Project;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ project }) => {
  const { showCompletedTasks, toggleCompletedTasks } = useUIStore();
  const [isProjectInfoExpanded, setIsProjectInfoExpanded] = useState(true);

  const handleOpenInVSCode = () => {
    // This would typically call an API endpoint that executes 'code' command
    window.open(`vscode://file/${project.localPath}`, '_blank');
  };

  const handleOpenInExplorer = () => {
    // This would typically call an API endpoint that opens the file explorer
    console.log('Opening in file explorer:', project.localPath);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Project Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {project.name}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleOpenInVSCode}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Open in VS Code"
          >
            <Terminal className="w-3 h-3" />
            VS Code
          </button>
          <button
            onClick={handleOpenInExplorer}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Open in File Explorer"
          >
            <FolderOpen className="w-3 h-3" />
            Explorer
          </button>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title="View on GitHub"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </a>
          )}
        </div>
      </div>

      {/* Project Info */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setIsProjectInfoExpanded(!isProjectInfoExpanded)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span>Project Info</span>
          {isProjectInfoExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {isProjectInfoExpanded && (
          <div className="px-4 pb-3 space-y-2 text-sm">
            {project.description && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Description:</span>
                <p className="text-gray-700 dark:text-gray-300 mt-1">{project.description}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">Path:</span>
              <p className="text-gray-700 dark:text-gray-300 font-mono text-xs mt-1 break-all">
                {project.localPath}
              </p>
            </div>
            {project.tags && project.tags.length > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Tags:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {project.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks Section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Tasks</h3>
            <button
              onClick={toggleCompletedTasks}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {showCompletedTasks ? 'Hide' : 'Show'} Completed
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <TaskList projectId={project.id} />
        </div>
      </div>

      {/* Project Stats */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Tasks</span>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {project.totalTasks}
            </p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Completed</span>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {project.completedTasks}
            </p>
          </div>
        </div>
        {project.totalTasks > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Progress</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                {Math.round((project.completedTasks / project.totalTasks) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(project.completedTasks / project.totalTasks) * 100}%`
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSidebar;