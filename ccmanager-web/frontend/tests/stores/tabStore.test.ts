import { renderHook, act } from '@testing-library/react';
import { useTabStore } from '../../src/stores/tabStore';
import { describe, test, expect, beforeEach } from 'vitest';

describe('Tab Store', () => {
  beforeEach(() => {
    // Reset store state
    useTabStore.setState({
      tabs: [],
      activeTabId: null
    });
  });

  test('creates new tab', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({
        workingDir: '/home/project',
        title: 'Project'
      });
    });
    
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]).toMatchObject({
      id: expect.stringMatching(/^tab_/),
      title: 'Project',
      workingDir: '/home/project',
      status: 'connecting'
    });
  });

  test('sets active tab on creation', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  test('enforces maximum tab limit', () => {
    const { result } = renderHook(() => useTabStore());
    
    // Create 20 tabs
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.createTab({ workingDir: `/home/test${i}` });
      }
    });
    
    expect(result.current.tabs).toHaveLength(20);
    
    // 21st tab should fail
    act(() => {
      const created = result.current.createTab({ workingDir: '/home/test21' });
      expect(created).toBe(false);
    });
    
    expect(result.current.tabs).toHaveLength(20);
  });

  test('switches between tabs', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test1', title: 'Tab 1' });
      result.current.createTab({ workingDir: '/home/test2', title: 'Tab 2' });
    });
    
    const tab1Id = result.current.tabs[0].id;
    const tab2Id = result.current.tabs[1].id;
    
    expect(result.current.activeTabId).toBe(tab2Id);
    
    act(() => {
      result.current.setActiveTab(tab1Id);
    });
    
    expect(result.current.activeTabId).toBe(tab1Id);
  });

  test('closes tab with confirmation', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    const tabId = result.current.tabs[0].id;
    
    // Mark as having active process
    act(() => {
      result.current.updateTab(tabId, { hasActiveProcess: true });
    });
    
    // Close should require confirmation
    act(() => {
      const needsConfirm = result.current.closeTab(tabId, false);
      expect(needsConfirm).toBe(true);
    });
    
    expect(result.current.tabs).toHaveLength(1);
    
    // Force close should work
    act(() => {
      result.current.closeTab(tabId, true);
    });
    
    expect(result.current.tabs).toHaveLength(0);
  });

  test('updates tab properties', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test' });
    });
    
    const tabId = result.current.tabs[0].id;
    
    act(() => {
      result.current.updateTab(tabId, {
        title: 'Updated Title',
        status: 'connected',
        sessionId: 'sess_123'
      });
    });
    
    expect(result.current.tabs[0]).toMatchObject({
      title: 'Updated Title',
      status: 'connected',
      sessionId: 'sess_123'
    });
  });

  test('persists tabs to localStorage', () => {
    const { result } = renderHook(() => useTabStore());
    
    act(() => {
      result.current.createTab({ workingDir: '/home/test1', title: 'Tab 1' });
      result.current.createTab({ workingDir: '/home/test2', title: 'Tab 2' });
    });
    
    // Get persisted state
    const persisted = result.current.getPersistedState();
    
    expect(persisted.tabs).toHaveLength(2);
    expect(persisted.activeTabId).toBe(result.current.activeTabId);
  });

  test('restores tabs from localStorage', () => {
    const { result } = renderHook(() => useTabStore());
    
    const savedState = {
      tabs: [
        {
          id: 'tab_saved1',
          title: 'Restored Tab 1',
          workingDir: '/home/restored1',
          sessionId: 'sess_old1',
          status: 'disconnected' as const,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tab_saved2',
          title: 'Restored Tab 2',
          workingDir: '/home/restored2',
          sessionId: 'sess_old2',
          status: 'disconnected' as const,
          hasActiveProcess: false,
          createdAt: new Date().toISOString()
        }
      ],
      activeTabId: 'tab_saved1'
    };
    
    act(() => {
      result.current.restoreFromPersistedState(savedState);
    });
    
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe('tab_saved1');
    expect(result.current.tabs[0].status).toBe('disconnected');
  });
});