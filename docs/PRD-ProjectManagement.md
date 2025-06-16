# PRD: CCManager Project Management System
Version: 1.0
Last Updated: 2025-01-15
Status: Draft

## 1. Context & Strategy

### Problem Statement
Developers using CCManager need to manage multiple projects and Claude Code sessions efficiently, especially when working from mobile devices. The current TUI is not optimized for mobile use and lacks visual project organization.

### Business Goal
Enable 50% faster project context switching and improve mobile development workflows by providing a visual, touch-friendly interface for CCManager project management.

### Target Personas
- **Primary**: Individual developers who work across multiple projects
- **Secondary**: Developers who need to monitor/manage projects from mobile devices

### Success Metrics
- Project switching time reduced from ~30s to <15s
- Mobile session management success rate >95%
- Zero loss of session context when switching projects
- <100ms UI response time on mobile devices

### Constraints
- Must integrate with existing CCManager infrastructure
- Cannot break existing TUI functionality
- Must work on mobile browsers (iOS Safari, Chrome)
- SQLite database must remain portable

## 2. Functional Requirements

### User Stories (Prioritized)
Priority calculated using Impact vs. Effort

#### US-001: View All Projects - Priority: 9/10
- **As a** developer
- **I want to** see all my CCManager projects in a visual dashboard
- **So that** I can quickly understand project status and switch between them
- **Acceptance Criteria:**
  - [ ] Display all projects from SQLite database (maps to test: INT-001)
  - [ ] Show active session indicators for each project (maps to test: UNIT-001)
  - [ ] Load dashboard in <500ms (maps to test: PERF-001)
  - [ ] Responsive grid layout on mobile devices (maps to test: E2E-001)

#### US-002: Quick Project Access - Priority: 9/10
- **As a** developer on mobile
- **I want to** open a project with a single tap
- **So that** I can start working immediately
- **Acceptance Criteria:**
  - [ ] Single tap navigates to project page (maps to test: E2E-002)
  - [ ] Restore last active session view (maps to test: INT-002)
  - [ ] Update last accessed timestamp (maps to test: UNIT-002)
  - [ ] Show loading state during navigation (maps to test: UNIT-003)

#### US-003: Manage Claude Sessions - Priority: 8/10
- **As a** developer
- **I want to** view Claude's output and send commands
- **So that** I can interact with Claude without full terminal emulation
- **Acceptance Criteria:**
  - [ ] Display Claude output in readable format (maps to test: UNIT-004)
  - [ ] Send text commands to Claude (maps to test: INT-003)
  - [ ] Show session connection status (maps to test: UNIT-005)
  - [ ] Preserve session history when switching tabs (maps to test: INT-004)

#### US-004: Task Management - Priority: 7/10
- **As a** developer
- **I want to** manage tasks alongside my Claude sessions
- **So that** I can track progress without leaving the interface
- **Acceptance Criteria:**
  - [ ] Add new tasks with single action (maps to test: E2E-003)
  - [ ] Mark tasks as complete (maps to test: UNIT-006)
  - [ ] Tasks persist to markdown files (maps to test: INT-005)
  - [ ] Filter active vs completed tasks (maps to test: UNIT-007)

#### US-005: Dev Server Control - Priority: 6/10
- **As a** developer
- **I want to** start/stop dev servers from the UI
- **So that** I can manage the full development environment
- **Acceptance Criteria:**
  - [ ] Start dev server with configured command (maps to test: INT-006)
  - [ ] View dev server output (maps to test: UNIT-008)
  - [ ] Stop dev server cleanly (maps to test: INT-007)
  - [ ] Show server running status (maps to test: UNIT-009)

#### US-006: Create New Project - Priority: 5/10
- **As a** developer
- **I want to** create new projects from the UI
- **So that** I can set up projects without using the CLI
- **Acceptance Criteria:**
  - [ ] Create project with required fields (maps to test: E2E-004)
  - [ ] Validate unique project paths (maps to test: UNIT-010)
  - [ ] Initialize project directory structure (maps to test: INT-008)
  - [ ] Auto-detect git repositories (maps to test: UNIT-011)

## 3. Technical Design

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    CCManager Web Frontend                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   React UI  │  │    Zustand   │  │  TanStack Query  │   │
│  │ Components  │  │    Stores    │  │   Data Fetching  │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         └─────────────────┼───────────────────┘             │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │                  API Routes (Next.js)                │    │
│  └────────────────────────┬────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Backend Services                           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Database   │  │   Session    │  │      Task       │   │
│  │   Service    │  │   Manager    │  │    Manager      │   │
│  │  (SQLite)    │  │  (Node PTY)  │  │  (Markdown)     │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Database Service
- **Responsibility:** Manage all project and session data persistence
- **Interface:**
  - Inputs: Project data, session metadata, query parameters
  - Outputs: Project[], Session[], operation status
  - Methods: 
    - `getProjects(): Promise<Project[]>`
    - `createProject(data: ProjectInput): Promise<Project>`
    - `updateProject(id: string, data: Partial<Project>): Promise<Project>`
    - `deleteProject(id: string): Promise<void>`
    - `getProjectSessions(projectId: string): Promise<Session[]>`
- **Data Model:** As specified in original schema
- **Dependencies:** better-sqlite3, project file system
- **Performance Requirements:** <50ms for queries, <100ms for writes
- **Security Considerations:** SQL injection prevention, path traversal protection

#### Session Manager Service
- **Responsibility:** Manage Claude Code PTY sessions without full terminal emulation
- **Interface:**
  - Inputs: Session commands, project configuration
  - Outputs: Formatted Claude output, session status
  - Methods:
    - `createSession(projectId: string, type: SessionType): Promise<Session>`
    - `sendCommand(sessionId: string, command: string): Promise<void>`
    - `getSessionOutput(sessionId: string, fromLine?: number): Promise<OutputLine[]>`
    - `terminateSession(sessionId: string): Promise<void>`
- **Dependencies:** Existing CCManager SessionManager, node-pty
- **Performance Requirements:** <100ms command latency
- **Security Considerations:** Command sanitization, session isolation

#### Task Manager Service
- **Responsibility:** Manage project tasks in markdown format
- **Interface:**
  - Inputs: Task data, project ID
  - Outputs: Task lists, operation status
  - Methods:
    - `getTasks(projectId: string): Promise<Task[]>`
    - `addTask(projectId: string, task: TaskInput): Promise<Task>`
    - `updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task>`
    - `toggleTask(projectId: string, taskId: string): Promise<Task>`
- **Dependencies:** File system, markdown parser
- **Performance Requirements:** <50ms for file operations
- **Security Considerations:** Path validation, file permissions

#### Frontend Components
- **ProjectDashboard:** Grid layout with project cards
- **ProjectPage:** Tabbed interface for sessions and tasks
- **SessionView:** Formatted output display with command input
- **TaskPanel:** Task list with add/edit/complete actions
- **DevServerPanel:** Server output with start/stop controls

## 4. Test Plan (Test-First)

### Test Coverage Requirements
- Unit Tests: Minimum 80% coverage, 100% for state management
- Integration Tests: All API endpoints and service boundaries
- E2E Tests: All user stories
- Performance Tests: Dashboard load, session switching
- Mobile Tests: Touch interactions, responsive layouts

### Testing: Database Service

#### Unit Tests
```markdown
**Test ID:** UNIT-001
**Test Name:** should_calculate_active_session_status
**Component:** Database Service - Project Status Calculator
**Related User Story:** US-001
**Test Type:** Unit

**Scenario:** Calculate if project has active sessions

**Test Steps:**
1. **Given:** Mock session data with various statuses
   - Project A: 2 active sessions (main, devserver)
   - Project B: 1 active session (main only)
   - Project C: No active sessions

2. **When:** Calculate project session status

3. **Then:** 
   - Project A: hasActiveMainSession = true, hasActiveDevSession = true
   - Project B: hasActiveMainSession = true, hasActiveDevSession = false
   - Project C: hasActiveMainSession = false, hasActiveDevSession = false

**Edge Cases:**
- Session with 'crashed' status should not count as active
- Multiple sessions of same type (use most recent)
```

```markdown
**Test ID:** UNIT-002
**Test Name:** should_update_last_accessed_timestamp
**Component:** Database Service - Project Update
**Related User Story:** US-002
**Test Type:** Unit

**Scenario:** Update project last accessed time

**Test Steps:**
1. **Given:** Existing project with old timestamp
   - Project created 7 days ago
   - Last accessed 3 days ago

2. **When:** updateLastAccessed(projectId) called

3. **Then:**
   - lastAccessedAt = current timestamp
   - All other fields unchanged
   - Database write confirmed

**Edge Cases:**
- Handle timezone differences
- Concurrent updates should use latest timestamp
```

#### Integration Tests
```markdown
**Test ID:** INT-001
**Test Name:** should_load_all_projects_with_session_status
**Component:** Database Service + Session Manager
**Related User Story:** US-001
**Test Type:** Integration

**Scenario:** Load project dashboard with live session data

**Test Steps:**
1. **Given:** Database with 5 projects and running sessions
   - 2 projects with active sessions
   - 1 project with crashed session
   - 2 projects with no sessions

2. **When:** GET /api/projects

3. **Then:**
   - Response in <500ms
   - All projects returned with correct session status
   - Session counts accurate
   - Memory usage <50MB

**Test Data:**
{
  "projects": [
    {
      "id": "proj1",
      "name": "My Web App",
      "hasActiveMainSession": true,
      "mainSessionId": "sess1"
    }
  ]
}
```

### Testing: Session Manager

#### Unit Tests
```markdown
**Test ID:** UNIT-004
**Test Name:** should_format_claude_output_for_display
**Component:** Session Output Formatter
**Related User Story:** US-003
**Test Type:** Unit

**Scenario:** Convert raw PTY output to clean display format

**Test Steps:**
1. **Given:** Raw Claude output with ANSI codes
   - Color codes
   - Cursor movements
   - Box drawing characters

2. **When:** formatOutput(rawOutput) called

3. **Then:**
   - ANSI codes stripped
   - Line breaks preserved
   - Box drawing converted to simple borders
   - Output readable on mobile

**Edge Cases:**
- Handle incomplete ANSI sequences
- Preserve code block formatting
- Handle very long lines (wrap vs scroll)
```

#### Integration Tests
```markdown
**Test ID:** INT-003
**Test Name:** should_send_command_to_claude_session
**Component:** Session Manager + PTY
**Related User Story:** US-003
**Test Type:** Integration

**Scenario:** Send user command to Claude

**Test Steps:**
1. **Given:** Active Claude session
   - Session connected and idle
   - User authenticated

2. **When:** POST /api/sessions/{id}/command
   - Body: { "command": "explain this code" }

3. **Then:**
   - Command sent to PTY
   - Response status 200
   - Output starts streaming
   - Session state updates to 'busy'

**Edge Cases:**
- Handle session timeout
- Queue commands if session busy
- Sanitize dangerous commands
```

### Testing: Frontend Components

#### E2E Tests
```markdown
**Test ID:** E2E-001
**Test Name:** should_display_responsive_project_grid
**Component:** Project Dashboard
**Related User Story:** US-001
**Test Type:** E2E

**Scenario:** View projects on mobile device

**Test Steps:**
1. **Given:** User on mobile browser (375px width)
   - 6 projects in database
   - Touch input enabled

2. **When:** Navigate to dashboard

3. **Then:**
   - Projects display in single column
   - Each card shows status indicators
   - Touch targets minimum 44px
   - No horizontal scroll
   - Load time <500ms

**Edge Cases:**
- Test on iOS Safari and Chrome
- Handle slow network (3G)
- Test with 0, 1, and 50+ projects
```

```markdown
**Test ID:** E2E-002
**Test Name:** should_navigate_to_project_with_single_tap
**Component:** Project Navigation
**Related User Story:** US-002
**Test Type:** E2E

**Scenario:** Open project from dashboard

**Test Steps:**
1. **Given:** Dashboard with project cards
   - User on mobile device
   - Project has active session

2. **When:** Tap on project card

3. **Then:**
   - Navigate to /project/{id}
   - Show loading indicator
   - Load last active tab (main session)
   - Display session output
   - Complete in <2s

**Edge Cases:**
- Handle double-tap prevention
- Test with poor network
- Handle navigation during loading
```

## 5. Implementation & Rollout

### Phase 1 (MVP) - Weeks 1-2
- **Features:** US-001, US-002, US-003
- **Components:** 
  - Database Service (projects, sessions tables)
  - Basic Session Manager (output display only)
  - Project Dashboard
  - Simple Session View
- **Tests to Write First:**
  - UNIT-001 through UNIT-005
  - INT-001 through INT-004
  - E2E-001, E2E-002
- **Definition of Done:**
  - [ ] All tests passing
  - [ ] Mobile responsive verified
  - [ ] No regression in TUI
  - [ ] Performance benchmarks met
- **Rollback Plan:** Feature flag to disable web UI
- **Success Metrics:** 
  - Dashboard loads in <500ms
  - Project switching works on mobile
  - Session output displays correctly

### Phase 2 - Weeks 3-4
- **Features:** US-004, US-005
- **Components:**
  - Task Manager Service
  - Task Panel UI
  - Dev Server Panel
  - Command input for sessions
- **Tests to Write First:**
  - UNIT-006 through UNIT-009
  - INT-005 through INT-007
  - E2E-003
- **Definition of Done:**
  - [ ] Task CRUD operations working
  - [ ] Dev server start/stop functional
  - [ ] Markdown files correctly formatted
  - [ ] Mobile task management smooth
- **Success Metrics:**
  - Task operations <100ms
  - Dev server output streams properly

### Phase 3 - Weeks 5-6
- **Features:** US-006, Polish & Optimization
- **Components:**
  - New Project Dialog
  - Project Settings
  - Performance optimizations
  - Error handling
- **Tests to Write First:**
  - UNIT-010, UNIT-011
  - INT-008
  - E2E-004
  - Performance test suite
- **Definition of Done:**
  - [ ] Project creation workflow complete
  - [ ] All error states handled
  - [ ] Performance targets met
  - [ ] Documentation complete

## 6. Risks & Mitigation

### Risk Matrix
| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Mobile browser PTY limitations | High | Medium | Use formatted output instead of full terminal |
| Session state sync issues | Medium | High | Implement robust state recovery, session history |
| SQLite performance on large datasets | Low | Medium | Add pagination, implement query optimization |
| Touch interaction complexity | Medium | Medium | Simplify UI, larger touch targets, gestures |

## 7. Technical Debt Log
| Item | Reason | Impact | Resolution Plan |
|------|--------|--------|----------------|
| Simplified terminal output | Mobile constraints | No ANSI art, colors | Phase 4: Rich output renderer |
| No collaborative features | MVP scope | Single user only | Phase 5: Multi-user support |
| Basic task management | Time constraint | No task dependencies | Phase 4: Advanced task features |

## 8. Appendices
- Existing CCManager API documentation
- SQLite schema migrations
- Mobile UI/UX guidelines
- Performance benchmarking tools