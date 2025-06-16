import { useEffect } from 'react';
import { useTabStore } from '../stores/tabStore';

export function useTabShortcuts() {
  const { tabs, activeTabId, setActiveTab, createTab, closeTab } = useTabStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + T: New tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        createTab({ workingDir: process.cwd() || '/' });
      }

      // Ctrl/Cmd + W: Close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        const needsConfirm = closeTab(activeTabId);
        if (needsConfirm) {
          if (confirm('This tab has an active process. Are you sure you want to close it?')) {
            closeTab(activeTabId, true);
          }
        }
      }

      // Ctrl/Cmd + Tab: Next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        if (tabs[nextIndex]) {
          setActiveTab(tabs[nextIndex].id);
        }
      }

      // Ctrl/Cmd + Shift + Tab: Previous tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        if (tabs[prevIndex]) {
          setActiveTab(tabs[prevIndex].id);
        }
      }

      // Ctrl/Cmd + 1-9: Switch to specific tab
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          setActiveTab(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, setActiveTab, createTab, closeTab]);
}