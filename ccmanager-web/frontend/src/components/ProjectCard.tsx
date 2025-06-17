import React from 'react';
import { MoreVertical, Circle, GitBranch, Server, CheckSquare, ExternalLink, Trash2, Edit } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Project } from '../stores/projectStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useUpdateProjectAccess, useDeleteProject } from '../hooks/useProjects';
import { formatDistanceToNow } from 'date-fns';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface ProjectCardProps {
  project: Project;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const navigate = useNavigate();
  const { selectProject } = useProjectStore();
  const { openEditProjectDialog } = useUIStore();
  const updateAccess = useUpdateProjectAccess();
  const deleteProject = useDeleteProject();

  const handleOpenProject = () => {
    selectProject(project.id);
    updateAccess.mutate(project.id);
    navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteProject.mutate(project.id);
    }
  };

  const taskProgress = project.totalTasks > 0 
    ? Math.round((project.completedTasks / project.totalTasks) * 100)
    : 0;

  return (
    <div
      onClick={handleOpenProject}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
              {project.description}
            </p>
          )}
        </div>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="ml-2 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[160px] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
              sideOffset={5}
            >
              <DropdownMenu.Item
                className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditProjectDialog(project.id);
                }}
              >
                <Edit className="w-4 h-4" />
                Edit
              </DropdownMenu.Item>
              
              {project.githubUrl && (
                <DropdownMenu.Item
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(project.githubUrl, '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4" />
                  View on GitHub
                </DropdownMenu.Item>
              )}
              
              <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              
              <DropdownMenu.Item
                className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer flex items-center gap-2"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <Circle
            className={`w-3 h-3 ${
              project.hasActiveMainSession
                ? 'text-green-500 fill-green-500'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Claude</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Server
            className={`w-3 h-3 ${
              project.hasActiveDevSession
                ? 'text-green-500'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Dev Server</span>
        </div>

        {project.githubUrl && (
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Git</span>
          </div>
        )}
      </div>

      {/* Task Progress */}
      {project.totalTasks > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Tasks</span>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {project.completedTasks}/{project.totalTasks}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${taskProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {project.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
            >
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Last accessed {formatDistanceToNow(new Date(project.lastAccessedAt), { addSuffix: true })}
      </div>
    </div>
  );
};

export default ProjectCard;