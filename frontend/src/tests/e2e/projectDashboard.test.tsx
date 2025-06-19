import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectDashboard from '../../components/ProjectDashboard';
import TaskList from '../../components/TaskList';
import NewProjectDialog from '../../components/NewProjectDialog';
import { api } from '../../api/client';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';

// Mock the API client
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the stores
vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => ({
    projects: [],
    isProjectDashboard: true,
    setProjects: vi.fn(),
    selectProject: vi.fn(),
    updateLastAccessed: vi.fn(),
  }),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({
    openNewProjectDialog: vi.fn(),
    isNewProjectDialogOpen: false,
    closeNewProjectDialog: vi.fn(),
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('E2E-001: Project Dashboard - Mobile View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set viewport to mobile size
    window.innerWidth = 375;
    window.innerHeight = 667;
  });

  it('should display responsive project grid on mobile device', async () => {
    const mockProjects = [
      {
        id: 'proj1',
        name: 'Project One',
        description: 'First test project',
        localPath: '/home/user/project1',
        workingDir: '/home/user/project1',
        hasActiveMainSession: true,
        hasActiveDevSession: false,
        totalTasks: 5,
        completedTasks: 2,
        tags: ['react', 'typescript'],
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        userId: 'user1',
      },
      {
        id: 'proj2',
        name: 'Project Two',
        description: 'Second test project',
        localPath: '/home/user/project2',
        workingDir: '/home/user/project2',
        hasActiveMainSession: false,
        hasActiveDevSession: true,
        totalTasks: 10,
        completedTasks: 10,
        tags: ['vue', 'javascript'],
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        userId: 'user1',
      },
    ];

    (api.get as any).mockResolvedValue({
      ok: true,
      json: async () => mockProjects,
    });

    const startTime = performance.now();
    const { container } = render(<ProjectDashboard />, { wrapper: createWrapper() });

    // Wait for projects to load
    await waitFor(() => {
      expect(screen.getByText('Project One')).toBeInTheDocument();
      expect(screen.getByText('Project Two')).toBeInTheDocument();
    });

    const loadTime = performance.now() - startTime;

    // Test 1: Projects display in single column
    const projectGrid = container.querySelector('[class*="grid"]');
    expect(projectGrid).toHaveClass('grid-cols-1');

    // Test 2: Each card shows status indicators
    const statusIndicators = screen.getAllByText(/Claude|Dev Server/);
    expect(statusIndicators.length).toBeGreaterThan(0);

    // Test 3: Touch targets minimum 44px
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      const rect = button.getBoundingClientRect();
      expect(rect.height).toBeGreaterThanOrEqual(44);
    });

    // Test 4: No horizontal scroll
    expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    // Test 5: Load time under 500ms
    expect(loadTime).toBeLessThan(500);
  });

  it('should handle zero projects gracefully', async () => {
    (api.get as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<ProjectDashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
      expect(screen.getByText('Get started by creating your first project')).toBeInTheDocument();
    });
  });

  it('should handle slow network (3G simulation)', async () => {
    // Simulate 3G network delay
    (api.get as any).mockImplementation(() => 
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => [],
          });
        }, 300); // 3G-like delay
      })
    );

    render(<ProjectDashboard />, { wrapper: createWrapper() });

    // Should show loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });
});

describe('E2E-002: Project Navigation', () => {
  const user = userEvent.setup();

  it('should navigate to project with single tap', async () => {
    const mockProject = {
      id: 'proj1',
      name: 'Test Project',
      localPath: '/home/user/project',
      workingDir: '/home/user/project',
      hasActiveMainSession: true,
      hasActiveDevSession: false,
      totalTasks: 0,
      completedTasks: 0,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      userId: 'user1',
    };

    const selectProject = vi.fn();

    vi.mocked(useProjectStore).mockReturnValue({
      projects: [mockProject],
      isProjectDashboard: true,
      setProjects: vi.fn(),
      selectProject,
      updateLastAccessed: vi.fn(),
    });

    (api.get as any).mockResolvedValue({
      ok: true,
      json: async () => [mockProject],
    });

    (api.post as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const startTime = performance.now();
    render(<ProjectDashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    // Simulate tap on project card
    const projectCard = screen.getByText('Test Project').closest('[class*="cursor-pointer"]');
    expect(projectCard).toBeInTheDocument();

    await user.click(projectCard!);

    // Verify navigation actions
    expect(selectProject).toHaveBeenCalledWith('proj1');

    const navigationTime = performance.now() - startTime;
    expect(navigationTime).toBeLessThan(2000);
  });

  it('should prevent double-tap navigation', async () => {
    const selectProject = vi.fn();

    vi.mocked(useProjectStore).mockReturnValue({
      projects: [],
      isProjectDashboard: true,
      setProjects: vi.fn(),
      selectProject,
      updateLastAccessed: vi.fn(),
    });

    const mockProject = {
      id: 'proj1',
      name: 'Test Project',
      localPath: '/home/user/project',
      workingDir: '/home/user/project',
      hasActiveMainSession: false,
      hasActiveDevSession: false,
      totalTasks: 0,
      completedTasks: 0,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      userId: 'user1',
    };

    (api.get as any).mockResolvedValue({
      ok: true,
      json: async () => [mockProject],
    });

    render(<ProjectDashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    const projectCard = screen.getByText('Test Project').closest('[class*="cursor-pointer"]');

    // Simulate double tap
    await user.dblClick(projectCard!);

    // Should only navigate once
    expect(selectProject).toHaveBeenCalledTimes(1);
  });
});

describe('E2E-003: Task Management', () => {
  const user = userEvent.setup();

  it('should add new task with single action', async () => {
    (api.post as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'task-1',
        text: 'New test task',
        completed: false,
        createdAt: new Date().toISOString(),
      }),
    });

    render(
      <TaskList projectId="proj1" />,
      { wrapper: createWrapper() }
    );

    // Find input and add button
    const input = screen.getByPlaceholderText('Add a new task...');
    const addButton = screen.getByRole('button', { name: /add/i });

    // Type task text
    await user.type(input, 'New test task');

    // Click add button
    await user.click(addButton);

    // Verify API call
    expect(api.post).toHaveBeenCalledWith(
      '/api/projects/proj1/tasks',
      { text: 'New test task', priority: undefined }
    );

    // Input should be cleared
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('should handle Enter key for quick task addition', async () => {
    (api.post as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'task-2',
        text: 'Quick task',
        completed: false,
        createdAt: new Date().toISOString(),
      }),
    });

    render(<TaskList projectId="proj1" />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText('Add a new task...');

    // Type and press Enter
    await user.type(input, 'Quick task{Enter}');

    // Verify API call
    expect(api.post).toHaveBeenCalledWith(
      '/api/projects/proj1/tasks',
      { text: 'Quick task', priority: undefined }
    );
  });
});

describe('E2E-004: Create New Project', () => {
  const user = userEvent.setup();

  it('should create project with required fields', async () => {
    const openDialog = vi.fn();
    const closeDialog = vi.fn();

    vi.mocked(useUIStore).mockReturnValue({
      openNewProjectDialog: openDialog,
      isNewProjectDialogOpen: true,
      closeNewProjectDialog: closeDialog,
    });

    (api.post as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'new-proj',
        name: 'My New Project',
        localPath: '/home/user/new-project',
        workingDir: '/home/user/new-project',
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        userId: 'user1',
      }),
    });

    render(<NewProjectDialog />, { wrapper: createWrapper() });

    // Fill in required fields
    const nameInput = screen.getByLabelText(/project name/i);
    const pathInput = screen.getByLabelText(/local path/i);

    await user.type(nameInput, 'My New Project');
    await user.type(pathInput, '/home/user/new-project');

    // Submit form
    const createButton = screen.getByRole('button', { name: /create project/i });
    await user.click(createButton);

    // Verify API call
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/projects', {
        name: 'My New Project',
        localPath: '/home/user/new-project',
        mainCommand: 'ccmanager',
      });
    });

    // Dialog should close
    expect(closeDialog).toHaveBeenCalled();
  });

  it('should validate unique project paths', async () => {
    vi.mocked(useUIStore).mockReturnValue({
      openNewProjectDialog: vi.fn(),
      isNewProjectDialogOpen: true,
      closeNewProjectDialog: vi.fn(),
    });

    (api.post as any).mockRejectedValue({
      ok: false,
      json: async () => ({
        error: 'A project with this path already exists',
      }),
    });

    render(<NewProjectDialog />, { wrapper: createWrapper() });

    const nameInput = screen.getByLabelText(/project name/i);
    const pathInput = screen.getByLabelText(/local path/i);

    await user.type(nameInput, 'Duplicate Project');
    await user.type(pathInput, '/existing/path');

    const createButton = screen.getByRole('button', { name: /create project/i });
    await user.click(createButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });
});