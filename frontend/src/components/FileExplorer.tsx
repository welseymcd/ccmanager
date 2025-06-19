import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { 
  Folder, 
  File, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  ChevronLeft,
  Home,
  RefreshCw,
  Download,
  Edit,
  Trash2,
  Plus,
  FolderPlus,
  Search,
  X,
  PanelLeftClose,
  PanelLeft
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
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authenticated/explorer' }) as { path?: string, projectId?: string }
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState(search.path || basePath)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('fileExplorer.sidebarCollapsed')
    return saved === 'true'
  })
  const queryClient = useQueryClient()
  const fileListRef = useRef<HTMLDivElement>(null)

  // Sync current path with URL
  useEffect(() => {
    if (search.path && search.path !== currentPath) {
      setCurrentPath(search.path)
    }
  }, [search.path])

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('fileExplorer.sidebarCollapsed', isSidebarCollapsed.toString())
  }, [isSidebarCollapsed])

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

  const navigateToPath = (path: string) => {
    navigate({
      to: '/explorer',
      search: {
        ...(projectId && { projectId }),
        path
      }
    })
  }

  const handleItemClick = (item: FileSystemItem) => {
    if (item.type === 'directory') {
      navigateToPath(item.path)
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

  // Set initial focus when items load
  useEffect(() => {
    if (filteredItems && filteredItems.length > 0 && !focusedPath) {
      setFocusedPath(filteredItems[0].path)
    }
  }, [filteredItems, focusedPath])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!filteredItems || filteredItems.length === 0) return

    const currentIndex = focusedPath ? filteredItems.findIndex(item => item.path === focusedPath) : -1
    let newIndex = currentIndex

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        newIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1
        break
      case 'ArrowDown':
        e.preventDefault()
        newIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0
        break
      case 'Enter':
        e.preventDefault()
        if (focusedPath) {
          const focusedItem = filteredItems.find(item => item.path === focusedPath)
          if (focusedItem) {
            handleItemClick(focusedItem)
          }
        }
        break
    }

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < filteredItems.length) {
      setFocusedPath(filteredItems[newIndex].path)
      
      // Scroll focused item into view
      setTimeout(() => {
        const focusedElement = fileListRef.current?.querySelector(`[data-path="${filteredItems[newIndex].path}"]`)
        focusedElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 0)
    }
  }, [filteredItems, focusedPath, handleItemClick])

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
        <div className={cn(
          "border-r border-gray-700 flex flex-col bg-gray-800 transition-all duration-300",
          isSidebarCollapsed ? "w-0" : "w-80"
        )}>
          {/* Search */}
          <div className={cn(
            "border-b border-gray-700",
            isSidebarCollapsed ? "hidden" : "p-4"
          )}>
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
        <div className={cn(
          "p-2 border-b border-gray-700 flex items-center gap-2",
          isSidebarCollapsed ? "hidden" : "block"
        )}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 hover:bg-gray-800 rounded-md"
            title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <div className="w-px h-6 bg-gray-600" />
          <button
            onClick={() => {
              const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
              navigateToPath(parentPath)
            }}
            disabled={currentPath === '/'}
            className="p-2 hover:bg-gray-800 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigateToPath('/')}
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
        <div className={cn(
          "px-4 py-2 border-b border-gray-700 flex items-center gap-1 text-sm",
          isSidebarCollapsed ? "hidden" : "block"
        )}>
          <button
            onClick={() => navigateToPath('/')}
            className="hover:text-blue-400"
          >
            /
          </button>
          {breadcrumbs.map((part, index) => (
            <span key={index} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-500" />
              <button
                onClick={() => navigateToPath('/' + breadcrumbs.slice(0, index + 1).join('/'))}
                className="hover:text-blue-400"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div 
          ref={fileListRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar",
            isSidebarCollapsed ? "hidden" : "block"
          )}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
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
              focusedPath={focusedPath}
              onItemClick={handleItemClick}
              onFocus={setFocusedPath}
            />
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Floating expand button when sidebar is collapsed */}
        {isSidebarCollapsed && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute top-4 left-4 z-10 p-2 bg-gray-800 hover:bg-gray-700 rounded-md shadow-lg"
            title="Show sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
        
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
  focusedPath: string | null
  onItemClick: (item: FileSystemItem) => void
  onFocus: (path: string) => void
  level?: number
}

function FileTreeItem({ 
  item, 
  selectedPath, 
  focusedPath,
  onItemClick, 
  onFocus,
  level = 0 
}: FileTreeItemProps) {
  const isSelected = selectedPath === item.path
  const isFocused = focusedPath === item.path

  return (
    <div>
      <div
        data-path={item.path}
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-gray-800",
          isSelected && "bg-gray-700",
          isFocused && "ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-900"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          onItemClick(item)
          onFocus(item.path)
        }}
        onMouseEnter={() => onFocus(item.path)}
      >
        
        {item.type === 'directory' ? (
          <Folder className="h-4 w-4 text-blue-400" />
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