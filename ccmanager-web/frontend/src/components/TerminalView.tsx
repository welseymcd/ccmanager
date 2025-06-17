import { forwardRef, useEffect, useRef, useImperativeHandle, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { useTabStore } from '../stores/tabStore';
import { useWebSocket } from '../hooks/useWebSocket';

interface TerminalViewProps {
  sessionId: string | null;
  tabId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  initialBuffer?: string;
  addLog?: (message: string) => void;
}

interface TerminalHandle {
  focus: () => void;
  clear: () => void;
  fit: () => void;
  search: (term: string, options?: any) => void;
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  ({ sessionId, tabId, status, initialBuffer, addLog }, ref) => {
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const initializingRef = useRef(false);
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

    // Write initial buffer when it becomes available
    useEffect(() => {
      if (initialBuffer && terminalRef.current && !terminalRef.current.element?.hasAttribute('data-buffer-written')) {
        if (addLog) {
          addLog(`[TerminalView] Writing initial buffer to terminal: ${initialBuffer.length} bytes`);
        }
        terminalRef.current.write(initialBuffer);
        // Mark that we've written the buffer to avoid duplicate writes
        terminalRef.current.element?.setAttribute('data-buffer-written', 'true');
      }
    }, [initialBuffer, addLog]);

    // Initialize terminal
    useEffect(() => {
      if (addLog) {
        addLog(`[TerminalView] Terminal init effect - sessionId: ${sessionId}, status: ${status}, hasContainer: ${!!terminalContainerRef.current}`);
      }
      
      if (!terminalContainerRef.current || !sessionId || status !== 'connected') {
        return;
      }
      
      // Prevent duplicate initialization
      if (initializingRef.current || terminalRef.current) {
        if (addLog) {
          addLog(`[TerminalView] Terminal already initializing or initialized, skipping...`);
        }
        return;
      }
      
      initializingRef.current = true;

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
        scrollback: 10000,
        // Ensure the terminal is interactive
        disableStdin: false,
        // Disable automatic device attribute requests
        windowsMode: false
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
        // Focus the terminal after opening
        terminal.focus();
        // Send initial size to backend
        if (sessionId && client) {
          const dimensions = fitAddon.proposeDimensions();
          if (dimensions && dimensions.cols > 0 && dimensions.rows > 0) {
            client.sendRaw({
              type: 'resize_terminal',
              sessionId,
              cols: dimensions.cols,
              rows: dimensions.rows
            } as any);
            
            if (addLog) {
              addLog(`[TerminalView] Terminal dimensions: ${dimensions.cols}x${dimensions.rows}`);
            }
          } else {
            // Fallback dimensions if proposal fails
            const fallbackCols = 80;
            const fallbackRows = 24;
            client.sendRaw({
              type: 'resize_terminal',
              sessionId,
              cols: fallbackCols,
              rows: fallbackRows
            } as any);
            
            if (addLog) {
              addLog(`[TerminalView] Using fallback dimensions: ${fallbackCols}x${fallbackRows}`);
            }
          }
        }
      }, 100);

      // Handle terminal input
      terminal.onData((data) => {
        // Filter out device attribute escape sequences that create feedback loops
        const deviceAttributePatterns = [
          /^\x1b\[>0;276;0c$/,  // Secondary Device Attribute response
          /^\x1b\[\?1;2c$/,      // Primary Device Attribute response
          /^\x1b\]10;rgb:[0-9a-f\/]+\x1b\\$/,  // OSC 10 (foreground color)
          /^\x1b\]11;rgb:[0-9a-f\/]+\x1b\\$/   // OSC 11 (background color)
        ];
        
        // Check if this is a device attribute response
        const isDeviceAttribute = deviceAttributePatterns.some(pattern => pattern.test(data));
        
        if (isDeviceAttribute) {
          if (addLog) {
            addLog(`[TerminalView] Filtered out device attribute: ${JSON.stringify(data)}`);
          }
          return; // Don't send device attributes to prevent loops
        }
        
        if (addLog) {
          addLog(`[TerminalView] onData triggered with data: ${JSON.stringify(data)} (length: ${data.length})`);
        }
        
        if (sessionId) {
          if (addLog) {
            addLog(`[TerminalView] Sending terminal data: ${JSON.stringify(data)} to session ${sessionId}`);
          }
          try {
            sendTerminalData(sessionId, data);
          } catch (error) {
            if (addLog) {
              addLog(`[TerminalView] Error sending data: ${error}`);
            }
            terminal.write('\r\n\x1b[31mSession disconnected. Please create a new session.\x1b[0m\r\n');
          }
        } else {
          if (addLog) {
            addLog(`[TerminalView] No sessionId, cannot send data`);
          }
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
      if (addLog) {
        addLog(`[TerminalView] Subscribing to session: ${sessionId}`);
      }
      subscribeToSession(sessionId);

      // Listen for terminal output
      const handleTerminalOutput = (message: any) => {
        if (message.sessionId === sessionId && message.data) {
          if (addLog) {
            addLog(`[TerminalView] Received terminal output: ${message.data.length} bytes`);
          }
          terminal.write(message.data);
        }
      };

      if (client) {
        client.on('terminal_output', handleTerminalOutput);
      }

      setIsInitialized(true);

      // Write initial buffer if available
      if (initialBuffer && initialBuffer.length > 0) {
        if (addLog) {
          addLog(`[TerminalView] Writing initial buffer after terminal creation: ${initialBuffer.length} bytes`);
        }
        // Clear terminal first to ensure clean state
        terminal.clear();
        // Reset cursor to home position
        terminal.write('\x1b[H');
        // Write the buffer
        terminal.write(initialBuffer);
        terminal.element?.setAttribute('data-buffer-written', 'true');
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
        initializingRef.current = false;
        setIsInitialized(false);
      };
    }, [sessionId, status, sendTerminalData, subscribeToSession, unsubscribeFromSession, client, handleResize, initialBuffer]);

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
      <div className="h-full w-full bg-black relative">
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
          className={`h-full w-full overflow-hidden ${status !== 'connected' ? 'hidden' : 'block'}`}
          style={{ 
            padding: '4px',
            minHeight: '200px',
            minWidth: '400px'
          }}
          onClick={() => {
            if (terminalRef.current) {
              terminalRef.current.focus();
            }
          }}
          onFocus={() => {
            if (terminalRef.current) {
              terminalRef.current.focus();
            }
          }}
          tabIndex={0}
        />
      </div>
    );
  }
);

TerminalView.displayName = 'TerminalView';