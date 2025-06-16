import { forwardRef, useEffect, useRef, useImperativeHandle, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useTabStore } from '../stores/tabStore';
import { useWebSocket } from '../hooks/useWebSocket';

interface TerminalViewProps {
  sessionId: string | null;
  tabId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  initialBuffer?: string;
}

interface TerminalHandle {
  focus: () => void;
  clear: () => void;
  fit: () => void;
  search: (term: string, options?: any) => void;
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  ({ sessionId, tabId, status, initialBuffer }, ref) => {
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const { updateTab } = useTabStore();
    const { sendTerminalData, subscribeToSession, unsubscribeFromSession, client } = useWebSocket();
    const [, setIsInitialized] = useState(false);

    // Handle terminal resize
    const handleResize = useCallback(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (error) {
          console.error('Error fitting terminal:', error);
        }
      }
    }, []);

    // Initialize terminal
    useEffect(() => {
      if (!terminalContainerRef.current || !sessionId || status !== 'connected') {
        return;
      }

      // Create terminal instance
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#ffffff',
          cursorAccent: '#000000',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        },
        allowTransparency: false,
        scrollback: 10000
      });

      // Create and load addons
      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);

      // Store references
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // Open terminal in container
      terminal.open(terminalContainerRef.current);
      
      // Initial fit
      setTimeout(() => {
        fitAddon.fit();
      }, 0);

      // Handle terminal input
      terminal.onData((data) => {
        if (sessionId) {
          sendTerminalData(sessionId, data);
        }
      });

      // Handle keyboard shortcuts
      terminal.attachCustomKeyEventHandler((event) => {
        // Handle Ctrl+C
        if (event.ctrlKey && event.key === 'c' && event.type === 'keydown') {
          event.preventDefault();
          if (sessionId) {
            sendTerminalData(sessionId, '\x03');
          }
          return false;
        }
        return true;
      });

      // Handle terminal resize
      terminal.onResize((size) => {
        if (sessionId && client) {
          client.sendRaw({
            type: 'resize_terminal',
            sessionId,
            cols: size.cols,
            rows: size.rows
          } as any);
        }
      });

      // Subscribe to session
      subscribeToSession(sessionId);

      // Listen for terminal output
      const handleTerminalOutput = (message: any) => {
        if (message.sessionId === sessionId && message.data) {
          terminal.write(message.data);
        }
      };

      if (client) {
        client.on('terminal_output', handleTerminalOutput);
      }

      setIsInitialized(true);
      
      // Write initial buffer if provided
      if (initialBuffer) {
        terminal.write(initialBuffer);
      }

      // Set up resize observer
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      
      if (terminalContainerRef.current) {
        resizeObserver.observe(terminalContainerRef.current);
      }

      // Cleanup
      return () => {
        if (client) {
          client.off('terminal_output', handleTerminalOutput);
        }
        
        if (sessionId) {
          unsubscribeFromSession(sessionId);
        }
        
        resizeObserver.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
        setIsInitialized(false);
      };
    }, [sessionId, status, sendTerminalData, subscribeToSession, unsubscribeFromSession, client, handleResize]);

    // Handle window resize
    useEffect(() => {
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, [handleResize]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        if (terminalRef.current) {
          terminalRef.current.focus();
        }
      },
      clear: () => {
        if (terminalRef.current) {
          terminalRef.current.clear();
        }
      },
      fit: () => {
        handleResize();
      },
      search: (term: string, options?: any) => {
        if (searchAddonRef.current) {
          searchAddonRef.current.findNext(term, options);
        }
      }
    }), [handleResize]);

    const getStatusMessage = () => {
      switch (status) {
        case 'connecting':
          return 'Connecting to Claude Code session...';
        case 'disconnected':
          return 'Session disconnected. Click to reconnect.';
        case 'error':
          return 'Error connecting to session. Please try again.';
        default:
          return null;
      }
    };

    const handleReconnect = () => {
      updateTab(tabId, { status: 'connecting' });
      // The actual reconnection will be handled by the parent component
    };

    return (
      <div className="h-full bg-black">
        {status !== 'connected' && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <p className="text-lg mb-4">{getStatusMessage()}</p>
              {status === 'connecting' && (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
              )}
              {status === 'disconnected' && (
                <button
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  onClick={handleReconnect}
                >
                  Reconnect
                </button>
              )}
              {status === 'error' && (
                <button
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  onClick={handleReconnect}
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
        <div 
          ref={terminalContainerRef} 
          className={`h-full w-full ${status !== 'connected' ? 'hidden' : ''}`}
          style={{ padding: '8px' }}
        />
      </div>
    );
  }
);

TerminalView.displayName = 'TerminalView';