import React, { useState } from 'react';
import { useTabStore } from '../stores/tabStore';
import { cn } from '../utils/cn';
import { X, Plus, Circle } from 'lucide-react';

interface NewTabDialogProps {
  onClose: () => void;
  onCreate: (config: { workingDir: string; title?: string }) => void;
}

function NewTabDialog({ onClose, onCreate }: NewTabDialogProps) {
  const [workingDir, setWorkingDir] = useState('');
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (workingDir.trim()) {
      onCreate({
        workingDir: workingDir.trim(),
        title: title.trim() || undefined
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold text-white mb-4">New Terminal Tab</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Working Directory
            </label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="/home/project"
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tab Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Project"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, createTab } = useTabStore();
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const needsConfirm = closeTab(tabId);
    
    if (needsConfirm) {
      if (confirm('This tab has an active process. Are you sure you want to close it?')) {
        closeTab(tabId, true);
      }
    }
  };

  const handleNewTab = () => {
    if (tabs.length >= 20) return;
    setShowNewTabDialog(true);
  };

  const getStatusIcon = (status: string) => {
    const statusColors: Record<string, string> = {
      connecting: 'text-yellow-500 animate-pulse',
      connected: 'text-green-500',
      disconnected: 'text-gray-500',
      error: 'text-red-500'
    };

    return (
      <Circle
        className={cn('w-2 h-2 fill-current', statusColors[status])}
        data-testid={`status-${status}`}
      />
    );
  };

  return (
    <>
      <div className="flex items-center bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <div className="flex items-center">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors',
                'border-r border-gray-800 hover:bg-gray-800',
                activeTabId === tab.id && 'bg-gray-800 text-white',
                activeTabId !== tab.id && 'text-gray-400'
              )}
              onClick={() => setActiveTab(tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
            >
              {getStatusIcon(tab.status)}
              <span className="max-w-[200px] truncate">{tab.title}</span>
              
              {hoveredTabId === tab.id && (
                <button
                  className="ml-2 p-0.5 rounded hover:bg-gray-700"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  aria-label="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          className={cn(
            'p-2 hover:bg-gray-800 transition-colors',
            tabs.length >= 20 && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleNewTab}
          disabled={tabs.length >= 20}
          aria-label="New tab"
        >
          <Plus className="w-4 h-4" />
        </button>
        
        {tabs.length >= 20 && (
          <span className="text-xs text-gray-500 ml-2">Maximum tabs reached</span>
        )}
      </div>

      {showNewTabDialog && (
        <NewTabDialog
          onClose={() => setShowNewTabDialog(false)}
          onCreate={(config) => {
            createTab(config);
            setShowNewTabDialog(false);
          }}
        />
      )}
    </>
  );
}