import { Router, Request, Response } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { AuthService } from '../services/auth'
import { ProjectService } from '../services/projectService'
import { DatabaseManager } from '../database/manager'
import { createAuthMiddleware, AuthRequest } from '../middleware/auth'

export function createExplorerRoutes(authService: AuthService, db: DatabaseManager): Router {
  const router = Router()
  const projectService = new ProjectService(db)
  const authenticateToken = createAuthMiddleware(authService)

  // Apply authentication to all routes
  router.use(authenticateToken)

  // Get the base path for a project or use home directory
  async function getBasePath(projectId?: string, userId?: string): Promise<string> {
    if (projectId && userId) {
      const project = await projectService.getProject(projectId, userId)
      if (project) {
        return project.localPath
      }
      throw new Error('Project not found or unauthorized')
    }
    return process.env.HOME || '/'
  }

  // List directory contents
  router.get('/list', async (req: AuthRequest, res: Response) => {
    try {
      const { path: requestPath = '/', projectId } = req.query
      const userId = req.user!.userId
      const basePath = await getBasePath(projectId as string, userId)
    const fullPath = path.join(basePath, requestPath as string)

    // Security check - ensure path doesn't escape base directory
    const resolvedPath = path.resolve(fullPath)
    const resolvedBase = path.resolve(basePath)
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const stats = await fs.stat(resolvedPath)
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' })
    }

    const items = await fs.readdir(resolvedPath)
    const itemsWithStats = await Promise.all(
      items.map(async (name) => {
        const itemPath = path.join(resolvedPath, name)
        const relativePath = path.relative(basePath, itemPath)
        try {
          const stats = await fs.stat(itemPath)
          return {
            name,
            path: '/' + relativePath.replace(/\\/g, '/'),
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.isDirectory() ? undefined : stats.size,
            modified: stats.mtime.toISOString(),
          }
        } catch (error) {
          // Handle permission errors gracefully
          return null
        }
      })
    )

    // Filter out null entries and hidden files (starting with .)
    const validItems = itemsWithStats
      .filter(item => item !== null && !item.name.startsWith('.'))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a!.type !== b!.type) {
          return a!.type === 'directory' ? -1 : 1
        }
        return a!.name.localeCompare(b!.name)
      })

    res.json(validItems)
  } catch (error) {
    console.error('Error listing directory:', error)
    res.status(500).json({ error: 'Failed to list directory' })
  }
})

  // Read file contents
  router.get('/read', async (req: AuthRequest, res: Response) => {
    try {
      const { path: requestPath, projectId } = req.query
      if (!requestPath) {
        return res.status(400).json({ error: 'Path is required' })
      }

      const userId = req.user!.userId
      const basePath = await getBasePath(projectId as string, userId)
    const fullPath = path.join(basePath, requestPath as string)

    // Security check
    const resolvedPath = path.resolve(fullPath)
    const resolvedBase = path.resolve(basePath)
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' })
    }

    // Check file size - don't read files larger than 10MB
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large' })
    }

    const content = await fs.readFile(resolvedPath, 'utf8')
    const fileType = getFileType(resolvedPath)

    res.json({ content, type: fileType })
  } catch (error) {
    console.error('Error reading file:', error)
    res.status(500).json({ error: 'Failed to read file' })
  }
})

  // Create file or directory
  router.post('/create', async (req: AuthRequest, res: Response) => {
    try {
      const { name, type, path: requestPath = '/', projectId } = req.body
      
      if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' })
      }

      const userId = req.user!.userId
      const basePath = await getBasePath(projectId as string, userId)
    const parentPath = path.join(basePath, requestPath)
    const fullPath = path.join(parentPath, name)

    // Security check
    const resolvedPath = path.resolve(fullPath)
    const resolvedBase = path.resolve(basePath)
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Check if already exists
    try {
      await fs.access(resolvedPath)
      return res.status(409).json({ error: 'Item already exists' })
    } catch {
      // File doesn't exist, continue
    }

    if (type === 'directory') {
      await fs.mkdir(resolvedPath, { recursive: true })
    } else {
      await fs.writeFile(resolvedPath, '')
    }

    const relativePath = path.relative(basePath, resolvedPath)
    res.json({ 
      success: true, 
      path: '/' + relativePath.replace(/\\/g, '/'),
      name,
      type
    })
  } catch (error) {
    console.error('Error creating item:', error)
    res.status(500).json({ error: 'Failed to create item' })
  }
})

  // Delete file or directory
  router.delete('/delete', async (req: AuthRequest, res: Response) => {
    try {
      const { path: requestPath, projectId } = req.body
      
      if (!requestPath) {
        return res.status(400).json({ error: 'Path is required' })
      }

      const userId = req.user!.userId
      const basePath = await getBasePath(projectId as string, userId)
    const fullPath = path.join(basePath, requestPath)

    // Security check
    const resolvedPath = path.resolve(fullPath)
    const resolvedBase = path.resolve(basePath)
    if (!resolvedPath.startsWith(resolvedBase) || resolvedPath === resolvedBase) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const stats = await fs.stat(resolvedPath)
    
      if (stats.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true })
      } else {
        await fs.unlink(resolvedPath)
      }

      res.json({ success: true })
    } catch (error) {
      console.error('Error deleting item:', error)
      res.status(500).json({ error: 'Failed to delete item' })
    }
  })

  // Write/update file contents
  router.put('/write', async (req: AuthRequest, res: Response) => {
    try {
      const { path: requestPath, content, projectId } = req.body
      
      if (!requestPath || content === undefined) {
        return res.status(400).json({ error: 'Path and content are required' })
      }

      const userId = req.user!.userId
      const basePath = await getBasePath(projectId as string, userId)
      const fullPath = path.join(basePath, requestPath)

      // Security check
      const resolvedPath = path.resolve(fullPath)
      const resolvedBase = path.resolve(basePath)
      if (!resolvedPath.startsWith(resolvedBase)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      await fs.writeFile(resolvedPath, content, 'utf8')
      
      res.json({ success: true })
    } catch (error) {
      console.error('Error writing file:', error)
      res.status(500).json({ error: 'Failed to write file' })
    }
  })

  // Helper function to determine file type
  function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const typeMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.r': 'r',
    '.scala': 'scala',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.fish': 'shell',
    '.ps1': 'powershell',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.cfg': 'ini',
    '.conf': 'ini',
    '.sql': 'sql',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.rst': 'restructuredtext',
    '.tex': 'latex',
    '.dockerfile': 'dockerfile',
    '.makefile': 'makefile',
    '.cmake': 'cmake',
    '.gradle': 'gradle',
    '.properties': 'properties',
    '.gitignore': 'gitignore',
    '.dockerignore': 'dockerignore',
    '.env': 'dotenv',
    '.log': 'log',
    '.txt': 'text',
  }
  
  return typeMap[ext] || 'text'
}

  return router
}