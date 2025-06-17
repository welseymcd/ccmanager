import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Github, Terminal, Server } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useProject, useUpdateProject } from '../hooks/useProjects';
import * as Dialog from '@radix-ui/react-dialog';

const EditProjectDialog: React.FC = () => {
  const { isEditProjectDialogOpen, editingProjectId, closeEditProjectDialog } = useUIStore();
  const { data: project } = useProject(editingProjectId || '');
  const updateProject = useUpdateProject();

  const [formData, setFormData] = useState({
    name: '',
    localPath: '',
    githubUrl: '',
    description: '',
    mainCommand: 'ccmanager',
    devServerCommand: '',
    devServerPort: '',
    tags: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form data when project loads or changes
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        localPath: project.localPath || '',
        githubUrl: project.githubUrl || '',
        description: project.description || '',
        mainCommand: project.mainCommand || 'ccmanager',
        devServerCommand: project.devServerCommand || '',
        devServerPort: project.devServerPort?.toString() || '',
        tags: project.tags?.join(', ') || '',
      });
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingProjectId) return;

    // Validate
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Project name is required';
    if (formData.devServerPort && isNaN(Number(formData.devServerPort))) {
      newErrors.devServerPort = 'Port must be a number';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await updateProject.mutateAsync({
        projectId: editingProjectId,
        updates: {
          name: formData.name.trim(),
          githubUrl: formData.githubUrl.trim() || undefined,
          description: formData.description.trim() || undefined,
          mainCommand: formData.mainCommand.trim() || 'ccmanager',
          devServerCommand: formData.devServerCommand.trim() || undefined,
          devServerPort: formData.devServerPort ? Number(formData.devServerPort) : undefined,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }
      });

      setErrors({});
      closeEditProjectDialog();
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to update project' });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleClose = () => {
    setErrors({});
    closeEditProjectDialog();
  };

  return (
    <Dialog.Root open={isEditProjectDialogOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Project
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Project Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                  errors.name
                    ? 'border-red-500 dark:border-red-400'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="My Awesome Project"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
              )}
            </div>

            {/* Local Path (Read-only) */}
            <div>
              <label htmlFor="localPath" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <FolderOpen className="inline w-4 h-4 mr-1" />
                Local Path
              </label>
              <input
                id="localPath"
                name="localPath"
                type="text"
                value={formData.localPath}
                disabled
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Path cannot be changed after project creation
              </p>
            </div>

            {/* GitHub URL */}
            <div>
              <label htmlFor="githubUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Github className="inline w-4 h-4 mr-1" />
                GitHub URL
              </label>
              <input
                id="githubUrl"
                name="githubUrl"
                type="url"
                value={formData.githubUrl}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="https://github.com/username/repository"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="A brief description of your project..."
              />
            </div>

            {/* Main Command */}
            <div>
              <label htmlFor="mainCommand" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Terminal className="inline w-4 h-4 mr-1" />
                Claude Command
              </label>
              <input
                id="mainCommand"
                name="mainCommand"
                type="text"
                value={formData.mainCommand}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="ccmanager"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The command to start Claude Code sessions
              </p>
            </div>

            {/* Dev Server Command */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="devServerCommand" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Server className="inline w-4 h-4 mr-1" />
                  Dev Server Command
                </label>
                <input
                  id="devServerCommand"
                  name="devServerCommand"
                  type="text"
                  value={formData.devServerCommand}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="npm run dev"
                />
              </div>

              <div>
                <label htmlFor="devServerPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  id="devServerPort"
                  name="devServerPort"
                  type="text"
                  value={formData.devServerPort}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                    errors.devServerPort
                      ? 'border-red-500 dark:border-red-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="3000"
                />
                {errors.devServerPort && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.devServerPort}</p>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tags
              </label>
              <input
                id="tags"
                name="tags"
                type="text"
                value={formData.tags}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="react, typescript, web"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Comma-separated list of tags
              </p>
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateProject.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateProject.isPending ? 'Updating...' : 'Update Project'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default EditProjectDialog;