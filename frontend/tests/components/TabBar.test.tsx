import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../src/components/TabBar';
import { useTabStore } from '../../src/stores/tabStore';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('TabBar Component', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null
    });
  });

  test('renders tabs', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Project A',
          workingDir: '/home/projecta',
          status: 'connected',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Project B',
          workingDir: '/home/projectb',
          status: 'connecting',
          sessionId: null,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    expect(screen.getByText('Project A')).toBeInTheDocument();
    expect(screen.getByText('Project B')).toBeInTheDocument();
  });

  test('shows status indicators', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Connected',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Connecting',
          status: 'connecting',
          workingDir: '/test',
          sessionId: null,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab3',
          title: 'Disconnected',
          status: 'disconnected',
          workingDir: '/test',
          sessionId: 'old_sess',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    expect(screen.getByTestId('status-connected')).toBeInTheDocument();
    expect(screen.getByTestId('status-connecting')).toBeInTheDocument();
    expect(screen.getByTestId('status-disconnected')).toBeInTheDocument();
  });

  test('handles tab click', () => {
    const setActiveTab = vi.fn();
    useTabStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'Tab 1',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess1',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab2',
          title: 'Tab 2',
          status: 'connected',
          workingDir: '/test',
          sessionId: 'sess2',
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab1',
      setActiveTab
    });

    render(<TabBar />);
    
    fireEvent.click(screen.getByText('Tab 2'));
    expect(setActiveTab).toHaveBeenCalledWith('tab2');
  });

  test('shows close button on hover', () => {
    useTabStore.setState({
      tabs: [{
        id: 'tab1',
        title: 'Hover Me',
        status: 'connected',
        workingDir: '/test',
        sessionId: 'sess1',
        hasActiveProcess: false,
        createdAt: new Date().toISOString()
      }],
      activeTabId: 'tab1'
    });

    render(<TabBar />);
    
    const tab = screen.getByText('Hover Me').closest('[role="tab"]');
    
    // Close button hidden initially
    expect(screen.queryByLabelText('Close tab')).not.toBeInTheDocument();
    
    // Show on hover
    fireEvent.mouseEnter(tab!);
    expect(screen.getByLabelText('Close tab')).toBeInTheDocument();
  });

  test('creates new tab with plus button', () => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null
    });

    render(<TabBar />);
    
    fireEvent.click(screen.getByLabelText('New tab'));
    
    // Should show the new tab dialog
    expect(screen.getByText('New Terminal Tab')).toBeInTheDocument();
  });

  test('shows tab limit warning', () => {
    const tabs = Array.from({ length: 20 }, (_, i) => ({
      id: `tab${i}`,
      title: `Tab ${i}`,
      status: 'connected' as const,
      workingDir: '/test',
      sessionId: `sess${i}`,
      hasActiveProcess: false,
      createdAt: new Date().toISOString()
    }));

    useTabStore.setState({
      tabs,
      activeTabId: 'tab0'
    });

    render(<TabBar />);
    
    const newTabButton = screen.getByLabelText('New tab');
    expect(newTabButton).toBeDisabled();
    expect(screen.getByText('Maximum tabs reached')).toBeInTheDocument();
  });
});