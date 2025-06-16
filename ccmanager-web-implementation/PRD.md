# PRD: CCManager Web Interface
Version: 1.0
Last Updated: 2025-06-14
Status: Approved

## 1. Context & Strategy

**Problem Statement:** Developers using CCManager are limited to CLI interaction, making it difficult to manage multiple Claude Code sessions efficiently and lacking visual context for worktree management.

**Business Goal:** Create a self-hosted web interface that enhances developer productivity by providing visual session management, multiple terminal tabs, and persistent session state.

**Target Personas:** 
- Primary: Individual developers wanting a better UI than CLI for managing Claude Code sessions
- Secondary: Development teams needing centralized Claude Code management

**Success Metrics:**
- 80% reduction in time to switch between Claude Code sessions
- Support for 10+ concurrent terminal sessions without performance degradation
- Zero data loss during connection interruptions
- < 100ms terminal input latency

**Constraints:**
- Must integrate with existing CCManager codebase
- Self-hosted deployment model
- Must maintain terminal-like responsiveness

## 2. Functional Requirements

### User Stories (Prioritized using RICE)

#### US-001: Multiple Terminal Tab Management - Priority: 900
**RICE Score**: Reach(100) × Impact(5) × Confidence(90%) / Effort(5) = 900

- **As a** developer
- **I want to** create and manage multiple terminal tabs, each with its own Claude Code session
- **So that** I can work on different worktrees simultaneously without context switching

**Acceptance Criteria:**
- [ ] User can create new terminal tabs with "+" button (maps to test: E2E-001)
- [ ] Each tab spawns independent Claude Code process (maps to test: INT-001)
- [ ] User can switch between tabs without losing session state (maps to test: E2E-002)
- [ ] User can close tabs with confirmation if process is active (maps to test: E2E-003)
- [ ] Tab titles show worktree name or custom label (maps to test: UNIT-001)
- [ ] Maximum 20 concurrent tabs with graceful error handling (maps to test: UNIT-002)
- [ ] Keyboard shortcuts for tab navigation (Ctrl+Tab, Ctrl+Shift+Tab) (maps to test: E2E-004)

#### US-002: Session Persistence Across Restarts - Priority: 720
**RICE Score**: Reach(80) × Impact(5) × Confidence(90%) / Effort(5) = 720

- **As a** developer
- **I want to** restore all my terminal sessions after server/browser restart
- **So that** I don't lose work context during system maintenance or crashes

**Acceptance Criteria:**
- [ ] Terminal output history persists to SQLite database (maps to test: INT-002)
- [ ] Session metadata stored with each restart (maps to test: UNIT-003)
- [ ] On reconnect, terminal shows last 1000 lines of history (maps to test: E2E-005)
- [ ] User input history is preserved and searchable (maps to test: E2E-006)
- [ ] Sessions marked as "restored" vs "active" in UI (maps to test: UNIT-004)
- [ ] Stale sessions (>7 days) can be auto-archived (maps to test: INT-003)

#### US-003: Dual Authentication System - Priority: 600
**RICE Score**: Reach(100) × Impact(4) × Confidence(75%) / Effort(5) = 600

- **As a** developer
- **I want to** authenticate with password AND manage my Claude API keys securely
- **So that** I can access the system securely and each session uses my personal API key

**Acceptance Criteria:**
- [ ] Password-based login with bcrypt hashing (maps to test: UNIT-005)
- [ ] JWT tokens for session management (maps to test: INT-004)
- [ ] API key encryption at rest using AES-256 (maps to test: UNIT-006)
- [ ] Per-user API key isolation in environment (maps to test: INT-005)
- [ ] API key validation before session creation (maps to test: E2E-007)
- [ ] Secure key rotation without session interruption (maps to test: E2E-008)

## 3. Technical Design

### Architecture Overview
Client-server architecture with WebSocket real-time communication, PTY process management, and SQLite persistence.

### Component Breakdown

#### Session Manager
- **Responsibility:** Manage PTY processes lifecycle
- **Interface:**
  - Inputs: sessionConfig (userId, workingDir, command)
  - Outputs: sessionId, terminal output stream
  - Methods: createSession, writeToSession, resizeSession, destroySession
- **Data Model:** PTYSession (id, userId, pty, buffer, metadata)
- **Dependencies:** node-pty, EventEmitter
- **Performance Requirements:** < 10ms write latency, 10MB buffer limit
- **Security Considerations:** Process isolation, API key injection

#### WebSocket Protocol
- **Responsibility:** Bidirectional real-time communication
- **Interface:**
  - Client→Server: terminal_input, create_session, close_session, resize_terminal
  - Server→Client: terminal_output, session_created, session_closed, session_error
- **Dependencies:** Socket.IO
- **Performance Requirements:** < 100ms round-trip latency
- **Security Considerations:** JWT authentication, rate limiting

#### Terminal Tab Manager
- **Responsibility:** Frontend tab state management
- **Interface:**
  - State: tabs[], activeTabId
  - Methods: createTab, closeTab, switchTab, updateTab
- **Dependencies:** Zustand, React
- **Performance Requirements:** Instant tab switching, localStorage persistence
- **Security Considerations:** XSS prevention in terminal output

## 4. Test Plan (Test-First)

### Test Coverage Requirements
- Unit Tests: Minimum 80% coverage, 100% for critical paths
- Integration Tests: All component boundaries
- E2E Tests: All user stories
- Performance Tests: Key user journeys
- Security Tests: All external interfaces

### Testing Matrix

| Component | Unit Tests | Integration Tests | E2E Tests |
|-----------|------------|-------------------|-----------|
| Session Manager | 12 | 8 | - |
| WebSocket Protocol | 10 | 15 | - |
| Tab Manager | 15 | 5 | 10 |
| Authentication | 10 | 8 | 5 |
| Database | 8 | 12 | - |

## 5. Implementation & Rollout

### Phase 1: Core Infrastructure (Week 1-2)
- **Features:** Basic server, WebSocket setup, test framework
- **Components:** Express server, Socket.IO, Vitest setup
- **Tests to Write First:** 
  1. WebSocket connection tests
  2. Message protocol validation
  3. Project structure tests
- **Definition of Done:**
  - [ ] All infrastructure tests passing
  - [ ] WebSocket echo working
  - [ ] Development environment ready
- **Rollback Plan:** Revert to previous commit, clear node_modules
- **Success Metrics:** Successful WebSocket handshake

### Phase 2: Backend Services (Week 3-4)
- **Features:** [US-001 partial, US-002 partial]
- **Components:** SessionManager, DatabaseManager, AuthService
- **Tests to Write First:**
  1. PTY session lifecycle tests
  2. Database schema tests
  3. Authentication flow tests
- **Definition of Done:**
  - [ ] All backend tests passing (>80% coverage)
  - [ ] Sessions persist across restarts
  - [ ] Authentication working
- **Rollback Plan:** Database backup/restore scripts
- **Success Metrics:** 100 concurrent sessions stable

### Phase 3: Frontend Implementation (Week 5-6)
- **Features:** [US-001 complete, US-003 complete]
- **Components:** Tab UI, Terminal emulator, Auth forms
- **Tests to Write First:**
  1. Tab store tests
  2. Terminal component tests
  3. Auth form validation tests
- **Definition of Done:**
  - [ ] All frontend tests passing
  - [ ] Tab management smooth
  - [ ] Terminal responsive
- **Rollback Plan:** Feature flags for UI components
- **Success Metrics:** < 100ms input latency

### Phase 4: Production Ready (Week 7)
- **Features:** Monitoring, deployment, documentation
- **Components:** Docker setup, monitoring, load balancing
- **Tests to Write First:**
  1. Load tests (100 users)
  2. Failover tests
  3. Security penetration tests
- **Definition of Done:**
  - [ ] Docker images built
  - [ ] Monitoring dashboards live
  - [ ] Documentation complete
- **Rollback Plan:** Blue-green deployment
- **Success Metrics:** 99.9% uptime target

## 6. Risks & Mitigation

### Risk Matrix
| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Terminal latency issues | High | High | Message queuing, WebSocket optimization |
| Session data loss | Medium | High | SQLite WAL mode, transaction logging |
| PTY process leaks | Medium | High | Process monitoring, automatic cleanup |
| Security vulnerabilities | Low | Critical | Regular security audits, penetration testing |
| Browser compatibility | Low | Medium | Progressive enhancement, fallbacks |

## 7. Technical Debt Log

| Item | Reason | Impact | Resolution Plan |
|------|--------|--------|-----------------|
| In-memory session cache | MVP speed | Higher memory usage | Implement Redis cache in Phase 5 |
| Basic auth only | Simplicity | No SSO support | Add OAuth2 in future release |
| Single-server design | MVP scope | No horizontal scaling | Add clustering support later |

## 8. Monitoring & Observability

**Key Metrics:**
- Terminal input latency (p50, p95, p99)
- Active sessions per user
- WebSocket connection stability
- Memory usage per session
- API key validation failures

**Alerts:**
- Terminal latency > 200ms
- Session count > 80% of limit
- Memory usage > 80%
- Failed authentications spike

## 9. Security Considerations

**API Key Management:**
- AES-256-GCM encryption at rest
- Unique IV per encryption
- Key rotation without downtime
- Audit trail for key usage

**Session Security:**
- JWT tokens with 7-day expiry
- Bcrypt with 12 salt rounds
- Process isolation per user
- Rate limiting on all endpoints

## 10. Success Criteria

**Launch Metrics:**
- All tests passing with >80% coverage
- WebSocket latency <100ms (p95)
- Support 20 concurrent sessions per user
- Zero data loss in 24-hour stress test
- Successful recovery from server restart

**Post-Launch Metrics (30 days):**
- 90% of users creating multiple tabs
- Average 5 tabs per active user
- <1% session failure rate
- 99.9% uptime achieved

## Appendices

### A. Implementation Guide Structure
See `/ccmanager-web-implementation/` directory for detailed atomic implementation steps.

### B. Test Specifications
Detailed test cases available in implementation documentation.

### C. API Documentation
WebSocket protocol and REST endpoints documented in OpenAPI format.

### D. Deployment Guide
Docker compose files and production deployment steps included.