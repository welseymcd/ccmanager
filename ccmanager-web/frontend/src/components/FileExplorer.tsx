import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { 
  Folder, 
  File, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  Home,
  RefreshCw,
  Download,
  Edit,
  Trash2,
  Plus,
  FolderPlus,
  Search,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjects'

interface FileSystemItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  children?: FileSystemItem[]
  isExpanded?: boolean
}

interface FileExplorerProps {
  projectId?: string
  basePath?: string
}

export default function FileExplorer({ projectId, basePath = '/' }: FileExplorerProps) {
  const { data: projects } = useProjects()
  const project = projects?.find(p => p.id === projectId)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState(basePath)
  const queryClient = useQueryClient()

  // Keep the current path at root when project is loaded
  // The backend will handle the actual project path
  useEffect(() => {
    if (project && basePath === '/') {
      setCurrentPath('/')
    }
  }, [project, basePath])

  // Fetch directory contents
  const { data: items, isLoading, error, refetch } = useQuery<FileSystemItem[]>({
    queryKey: ['files', currentPath, projectId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectId) params.append('projectId', projectId)
      params.append('path', currentPath)
      
      const response = await fetch(`/api/explorer/list?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch directory contents')
      }
      
      return response.json()
    }
  })

  // Create new file/folder
  const createMutation = useMutation({
    mutationFn: async ({ name, type, path }: { name: string; type: 'file' | 'directory'; path: string }) => {
      const response = await fetch('/api/explorer/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ 
          name, 
          type, 
          path,
          projectId 
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create item')
      }
      
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    }
  })

  // Delete file/folder
  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await fetch('/api/explorer/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ path, projectId })
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete item')
      }
      
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      setSelectedPath(null)
    }
  })

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const handleItemClick = (item: FileSystemItem) => {
    if (item.type === 'directory') {
      toggleFolder(item.path)
      setCurrentPath(item.path)
    } else {
      setSelectedPath(item.path)
    }
  }

  const handleCreateNew = (type: 'file' | 'directory') => {
    const name = prompt(`Enter ${type === 'file' ? 'file' : 'folder'} name:`)
    if (name) {
      createMutation.mutate({ name, type, path: currentPath })
    }
  }

  const handleDelete = () => {
    if (selectedPath && confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(selectedPath)
    }
  }

  const filteredItems = items?.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const breadcrumbs = currentPath.split('/').filter(Boolean)

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={project ? `/projects/$projectId` : "/"}
            params={project ? { projectId: project.id } : undefined}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            {project ? `Back to ${project.name}` : 'Back to Projects'}
          </Link>
          <h1 className="text-lg font-semibold">
            File Explorer {project && <span className="text-gray-400 text-sm">- {project.name}</span>}
          </h1>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-700 flex flex-col bg-gray-800">
          {/* Search */}
          <div className="p-4 border-b border-gray-700">
            <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-100" />
              </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-2 border-b border-gray-700 flex items-center gap-2">
          <button
            onClick={() => setCurrentPath('/')}
            className="p-2 hover:bg-gray-800 rounded-md"
            title="Go to root"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-800 rounded-md"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => handleCreateNew('file')}
            className="p-2 hover:bg-gray-800 rounded-md"
            title="New file"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleCreateNew('directory')}
            className="p-2 hover:bg-gray-800 rounded-md"
            title="New folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedPath}
            className="p-2 hover:bg-gray-800 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-1 text-sm">
          <button
            onClick={() => setCurrentPath('/')}
            className="hover:text-blue-400"
          >
            /
          </button>
          {breadcrumbs.map((part, index) => (
            <span key={index} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-500" />
              <button
                onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, index + 1).join('/'))}
                className="hover:text-blue-400"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
          
          {error ? (
            <div className="p-4 text-red-400 text-sm">
              Error loading files: {error instanceof Error ? error.message : String(error)}
            </div>
          ) : null}
          
          {filteredItems && filteredItems.length === 0 && (
            <div className="p-4 text-gray-400 text-sm text-center">
              No files found
            </div>
          )}
          
          {filteredItems?.map((item) => (
            <FileTreeItem
              key={item.path}
              item={item}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onItemClick={handleItemClick}
              onToggleFolder={toggleFolder}
            />
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath ? (
          <FileViewer path={selectedPath} projectId={projectId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a file to view
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

interface FileTreeItemProps {
  item: FileSystemItem
  selectedPath: string | null
  expandedFolders: Set<string>
  onItemClick: (item: FileSystemItem) => void
  onToggleFolder: (path: string) => void
  level?: number
}

function FileTreeItem({ 
  item, 
  selectedPath, 
  expandedFolders, 
  onItemClick, 
  onToggleFolder,
  level = 0 
}: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(item.path)
  const isSelected = selectedPath === item.path

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-gray-800",
          isSelected && "bg-gray-700"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onItemClick(item)}
      >
        {item.type === 'directory' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFolder(item.path)
            }}
            className="p-0.5"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        
        {item.type === 'directory' ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-blue-400" />
          ) : (
            <Folder className="h-4 w-4 text-blue-400" />
          )
        ) : (
          <File className="h-4 w-4 text-gray-400" />
        )}
        
        <span className="text-sm">{item.name}</span>
        
        {item.size !== undefined && (
          <span className="ml-auto text-xs text-gray-500">
            {formatFileSize(item.size)}
          </span>
        )}
      </div>
      
      {item.type === 'directory' && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onItemClick={onItemClick}
              onToggleFolder={onToggleFolder}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FileViewerProps {
  path: string
  projectId?: string
}

function FileViewer({ path, projectId }: FileViewerProps) {
  const { data: content, isLoading, error } = useQuery<{ content: string; type: string }>({
    queryKey: ['file-content', path, projectId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectId) params.append('projectId', projectId)
      params.append('path', path)
      
      const response = await fetch(`/api/explorer/read?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to read file')
      }
      
      return response.json()
    }
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        Error loading file: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-gray-700 p-4 flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-medium">{path.split('/').pop()}</h3>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-gray-800 rounded-md" title="Edit">
            <Edit className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-md" title="Download">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 custom-scrollbar min-h-0">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words">{content?.content}</pre>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}