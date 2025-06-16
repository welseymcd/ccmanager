-- Migration: Add project management tables
-- Version: 002
-- Description: Add tables for project management, project sessions, and dev servers

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  local_path TEXT NOT NULL,
  github_url TEXT,
  description TEXT,
  main_command TEXT DEFAULT 'ccmanager',
  dev_server_command TEXT,
  dev_server_port INTEGER,
  working_dir TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tags TEXT, -- JSON array of tags
  user_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(local_path, user_id)
);

-- Create index for user projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed_at);

-- Project sessions table (links sessions to projects)
CREATE TABLE IF NOT EXISTS project_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('main', 'devserver')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(project_id, session_type)
);

-- Create indexes for project sessions
CREATE INDEX IF NOT EXISTS idx_project_sessions_project_id ON project_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_sessions_session_id ON project_sessions(session_id);

-- Project tasks metadata (tracks task files)
CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL,
  task_file_path TEXT NOT NULL, -- relative path from project tasks dir
  task_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create index for project tasks
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);

-- Dev server status table
CREATE TABLE IF NOT EXISTS dev_servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL,
  session_id TEXT,
  port INTEGER,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('starting', 'running', 'stopping', 'stopped', 'error')),
  started_at DATETIME,
  stopped_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  UNIQUE(project_id)
);

-- Create index for dev servers
CREATE INDEX IF NOT EXISTS idx_dev_servers_project_id ON dev_servers(project_id);

-- Check if project_id column exists in sessions table
-- If not, add it (handling both fresh installs and upgrades)
-- Note: SQLite doesn't support conditional ALTER TABLE, so we'll just create the index
-- The column should either exist from the base schema or from a previous run

-- Create index for sessions project_id
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);

-- Create view for project dashboard
CREATE VIEW IF NOT EXISTS project_dashboard AS
SELECT 
  p.id,
  p.name,
  p.local_path,
  p.github_url,
  p.description,
  p.tags,
  p.last_accessed_at,
  p.created_at,
  -- Main session info
  CASE 
    WHEN ms.session_id IS NOT NULL AND s1.status = 'active' THEN 1 
    ELSE 0 
  END as has_active_main_session,
  ms.session_id as main_session_id,
  -- Dev server info
  CASE 
    WHEN ds.status = 'running' THEN 1 
    ELSE 0 
  END as has_active_dev_server,
  ds.port as dev_server_port,
  ds.status as dev_server_status,
  -- Task stats
  COALESCE(SUM(pt.task_count), 0) as total_tasks,
  COALESCE(SUM(pt.completed_count), 0) as completed_tasks
FROM projects p
LEFT JOIN project_sessions ms ON p.id = ms.project_id AND ms.session_type = 'main'
LEFT JOIN sessions s1 ON ms.session_id = s1.id
LEFT JOIN dev_servers ds ON p.id = ds.project_id
LEFT JOIN project_tasks pt ON p.id = pt.project_id
GROUP BY p.id;