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
  showVirtualKeyboard?: boolean;
  onVirtualKeyboardToggle?: () => void;
}

interface TerminalHandle {
  focus: () => void;
  clear: () => void;
  fit: () => void;
  search: (term: string, options?: any) => void;
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  ({ sessionId, tabId, status, initialBuffer, addLog, showVirtualKeyboard = false, onVirtualKeyboardToggle }, ref) => {
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const initializingRef = useRef(false);
    const cleanupHandlersRef = useRef<{
      handleDirectKeydown?: (e: KeyboardEvent) => void;
      handleInput?: (e: Event) => void;
      textarea?: HTMLTextAreaElement | null;
    }>({});
    const { updateTab } = useTabStore();
    const { sendTerminalData, subscribeToSession, unsubscribeFromSession, client, isConnected } = useWebSocket();
    const [, setIsInitialized] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mobileDebug, setMobileDebug] = useState<string[]>([]);
    const [debugVisible, setDebugVisible] = useState(true);

    // Helper to add mobile debug messages
    const addMobileDebug = useCallback((msg: string) => {
      // Add timestamp to each message
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      const msgWithTime = `[${timestamp}] ${msg}`;
      setMobileDebug(prev => [...prev.slice(-9), msgWithTime]);  // Keep last 10 messages
      // Don't call addLog to avoid dependency loop
      console.log(`[TerminalView] ${msg}`);
    }, []); // No dependencies to prevent infinite loop

    // Detect mobile device (run only once on mount)
    useEffect(() => {
      const checkMobile = () => {
        const isTouchDevice = ('ontouchstart' in window) || 
                             (navigator.maxTouchPoints > 0) || 
                             (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        const isSmallScreen = window.innerWidth < 768;
        const mobileDetected = isTouchDevice || isSmallScreen;
        setIsMobile(mobileDetected);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []); // No dependencies to prevent re-running

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
        try {
          addMobileDebug(`Writing initial buffer to terminal: ${initialBuffer.length} bytes`);
          terminalRef.current.write(initialBuffer);
          // Mark that we've written the buffer to avoid duplicate writes
          terminalRef.current.element?.setAttribute('data-buffer-written', 'true');
        } catch (e) {
          console.error('Error writing initial buffer:', e);
        }
      }
    }, [initialBuffer, addMobileDebug]);

    // Initialize terminal
    useEffect(() => {
      if (addLog) {
        addLog(`[TerminalView] Terminal init effect - sessionId: ${sessionId}, status: ${status}, hasContainer: ${!!terminalContainerRef.current}`);
      }
      
      if (!terminalContainerRef.current || !sessionId) {
        return;
      }
      
      // Allow initialization for connecting and connected states
      if (status !== 'connected' && status !== 'connecting') {
        return;
      }
      
      // Prevent duplicate initialization for the same session
      if (initializingRef.current) {
        if (addLog) {
          addLog(`[TerminalView] Terminal already initializing, skipping...`);
        }
        return;
      }
      
      // If we already have a terminal for a different session, clean it up first
      if (terminalRef.current) {
        const currentSessionId = terminalRef.current.element?.getAttribute('data-session-id');
        if (currentSessionId !== sessionId) {
          if (addLog) {
            addLog(`[TerminalView] Session changed from ${currentSessionId} to ${sessionId}, cleaning up old terminal...`);
          }
          // Clean up old terminal
          try {
            terminalRef.current.dispose();
          } catch (e) {
            console.error('Error disposing old terminal:', e);
          }
          terminalRef.current = null;
          fitAddonRef.current = null;
          searchAddonRef.current = null;
          // Don't manipulate DOM directly - disposal should handle cleanup
        } else {
          if (addLog) {
            addLog(`[TerminalView] Terminal already exists for this session, skipping...`);
          }
          return;
        }
      }
      
      // Ensure container is clean before creating new terminal
      // Don't manipulate DOM directly - let xterm handle it
      
      initializingRef.current = true;

      // Log terminal creation
      const debugMsg = `Creating terminal - sessionId: ${sessionId}`;
      addMobileDebug(debugMsg);
      if (addLog) {
        addLog(`[TerminalView] Creating terminal instance - mobile: ${isMobile}, sessionId: ${sessionId}`);
      }

      // Ensure container is ready and has dimensions
      const containerReady = terminalContainerRef.current.offsetWidth > 0 && terminalContainerRef.current.offsetHeight > 0;
      if (!containerReady) {
        if (addLog) {
          addLog(`[TerminalView] Container not ready, waiting...`);
        }
        // Wait for next frame and retry
        requestAnimationFrame(() => {
          if (!initializingRef.current || terminalRef.current) return;
          // Retry initialization
          initializingRef.current = false;
        });
        return;
      }


      // Create terminal instance with DOM renderer
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: isMobile ? 12 : 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        // Use DOM renderer explicitly and ensure it's available
        renderer: {
          type: 'dom'
        },
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
        scrollback: isMobile ? 5000 : 10000,
        // CRITICAL: Ensure input is enabled
        disableStdin: false,
        // Disable automatic device attribute requests
        windowsMode: false,
        // Mobile-friendly settings
        scrollOnUserInput: true,
        // Force specific dimensions initially
        cols: 80,
        rows: 24,
        // Enable cursor style
        cursorStyle: 'block',
        // Ensure proper focus behavior
        macOptionIsMeta: true,
        // Enable all input modes
        convertEol: false
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
      try {
        terminal.open(terminalContainerRef.current);
        
        // Log terminal opening details
        if (addLog) {
          addLog(`[TerminalView] Terminal opened successfully`);
          addLog(`[TerminalView] Terminal element exists: ${!!terminal.element}`);
          addLog(`[TerminalView] Terminal textarea exists: ${!!terminal.textarea}`);
          addLog(`[TerminalView] Container dimensions: ${terminalContainerRef.current.offsetWidth}x${terminalContainerRef.current.offsetHeight}`);
        }
        
        // Verify the terminal DOM structure for DOM renderer
        const xtermElement = terminalContainerRef.current.querySelector('.xterm');
        const xtermScreen = terminalContainerRef.current.querySelector('.xterm-screen');
        const xtermRows = terminalContainerRef.current.querySelector('.xterm-rows');
        const xtermViewport = terminalContainerRef.current.querySelector('.xterm-viewport');
        
        if (addLog) {
          addLog(`[TerminalView] DOM check - xterm element: ${!!xtermElement}`);
          addLog(`[TerminalView] DOM check - xterm-screen: ${!!xtermScreen}`);
          addLog(`[TerminalView] DOM check - xterm-rows: ${!!xtermRows}`);
          addLog(`[TerminalView] DOM check - xterm-viewport: ${!!xtermViewport}`);
        }
        
        // For DOM renderer, we expect xterm-rows instead of canvas
        if (!xtermRows && !xtermViewport) {
          if (addLog) {
            addLog(`[TerminalView] WARNING: No xterm-rows or viewport found, DOM renderer may not be working properly`);
          }
        } else {
          if (addLog) {
            addLog(`[TerminalView] DOM renderer elements found - terminal should be rendering correctly`);
          }
        }
        
        // Force a refresh to ensure rendering
        terminal.refresh(0, terminal.rows - 1);
        
        // Don't write test messages - they interfere with the actual terminal content
        
      } catch (openError) {
        if (addLog) {
          addLog(`[TerminalView] Error opening terminal: ${openError}`);
        }
        console.error('Failed to open terminal:', openError);
      }
      
      // Mark terminal element with session ID to prevent duplicates
      if (terminal.element) {
        terminal.element.setAttribute('data-session-id', sessionId);
      }
      
      // Create a local debug function for this terminal instance
      const terminalAddMobileDebug = (msg: string) => {
        addMobileDebug(msg);
      };
      
      // CRITICAL: Set up input handling after opening
      // Force the terminal to be interactive
      terminal.focus();
      
      // Simplified fallback handler - only for when onData completely fails
      const handleDirectKeydown = (e: KeyboardEvent) => {
        // Only use this handler if onData hasn't fired recently (indicating it's broken)
        const lastOnDataTime = (window as any).lastOnDataTime || 0;
        const timeSinceLastOnData = Date.now() - lastOnDataTime;
        
        // If onData is working (fired within last 5 seconds), don't interfere
        if (timeSinceLastOnData < 5000) {
          return;
        }
        
        // Emergency fallback only - don't write to terminal, only send to backend
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          if (sessionId && client) {
            client.sendTerminalData(sessionId, e.key);
          }
        }
      };
      
      terminalContainerRef.current.addEventListener('keydown', handleDirectKeydown);
      
      // Also add directly to the textarea once it exists
      setTimeout(() => {
        const textarea = terminalContainerRef.current?.querySelector('textarea');
        if (textarea) {
          textarea.addEventListener('keydown', handleDirectKeydown);
          terminalAddMobileDebug('Added keydown handler directly to textarea');
        }
      }, 100);
      
      // Also add input event listener for mobile
      const handleInput = (e: Event) => {
        const target = e.target as HTMLTextAreaElement;
        if (target && target.value) {
          terminalAddMobileDebug(`Input event: ${target.value}`);
          if (sessionId && client) {
            client.sendTerminalData(sessionId, target.value);
            terminal.write(target.value);
            target.value = '';
            terminalAddMobileDebug(`✓ Sent input: "${target.value}"`);
          } else {
            terminalAddMobileDebug(`✗ Cannot send input`);
          }
        }
      };
      
      let textarea: HTMLTextAreaElement | null = null;
      // Try to get textarea after a slight delay to ensure terminal is rendered
      setTimeout(() => {
        textarea = terminalContainerRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.addEventListener('input', handleInput);
          terminalAddMobileDebug(`Added input listener to textarea`);
        } else {
          terminalAddMobileDebug(`No textarea found for input listener`);
        }
      }, 200);
      
      // Initial fit and focus
      setTimeout(() => {
        // Get terminal dimensions before fit
        const container = terminalContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          terminalAddMobileDebug(`Container size: ${rect.width}x${rect.height}`);
        }
        
        // Fit terminal to container
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            terminalAddMobileDebug(`Fit dims: ${dims.cols}x${dims.rows}`);
          } else {
            terminalAddMobileDebug(`Fit failed - no dims`);
            // Force some dimensions
            terminal.resize(80, 24);
          }
        } catch (e) {
          terminalAddMobileDebug(`Fit error: ${e}`);
          terminal.resize(80, 24);
        }
        
        // Focus the terminal after opening
        terminal.focus();
        // Force focus on the textarea element
        const textarea = terminalContainerRef.current?.querySelector('textarea');
        if (textarea) {
          (textarea as HTMLTextAreaElement).focus();
          if (addLog) {
            addLog(`[TerminalView] Terminal opened and textarea focused`);
          }
        } else {
          if (addLog) {
            addLog(`[TerminalView] Terminal opened but no textarea found`);
          }
        }
        // Send initial size to backend
        const resizeClient = client || (window as any).__webSocketClient;
        if (sessionId && resizeClient) {
          const dimensions = fitAddon.proposeDimensions();
          let cols = 80;
          let rows = 24;
          
          if (dimensions && dimensions.cols > 0 && dimensions.rows > 0) {
            cols = dimensions.cols;
            rows = dimensions.rows;
            terminalAddMobileDebug(`Using fit dims: ${cols}x${rows}`);
          } else {
            terminalAddMobileDebug(`Using fallback dims: ${cols}x${rows}`);
          }
          
          resizeClient.sendRaw({
            type: 'resize_terminal',
            sessionId,
            cols,
            rows
          } as any);
          
          // Also send a refresh request to get current buffer (only once)
          if (!terminal.element?.hasAttribute('data-refresh-sent')) {
            terminalAddMobileDebug(`Requesting buffer refresh`);
            resizeClient.sendRaw({
              type: 'refresh_terminal',
              sessionId
            } as any);
            terminal.element?.setAttribute('data-refresh-sent', 'true');
          }
        }
      }, 100);

      // Handle touch events for mobile
      if (isMobile && terminalContainerRef.current) {
        let touchStartY = 0;
        let touchStartX = 0;
        
        const handleTouchStart = (e: TouchEvent) => {
          touchStartY = e.touches[0].clientY;
          touchStartX = e.touches[0].clientX;
        };
        
        const handleTouchEnd = (e: TouchEvent) => {
          const touchEndY = e.changedTouches[0].clientY;
          const touchEndX = e.changedTouches[0].clientX;
          const deltaY = touchStartY - touchEndY;
          const deltaX = touchStartX - touchEndX;
          
          // Swipe detection threshold
          const threshold = 50;
          
          if (Math.abs(deltaY) > Math.abs(deltaX)) {
            // Vertical swipe
            if (deltaY > threshold) {
              // Swipe up - scroll down
              terminal.scrollLines(3);
            } else if (deltaY < -threshold) {
              // Swipe down - scroll up
              terminal.scrollLines(-3);
            }
          }
        };
        
        terminalContainerRef.current.addEventListener('touchstart', handleTouchStart);
        terminalContainerRef.current.addEventListener('touchend', handleTouchEnd);
        
        // Clean up touch event listeners on unmount
        return () => {
          if (terminalContainerRef.current) {
            terminalContainerRef.current.removeEventListener('touchstart', handleTouchStart);
            terminalContainerRef.current.removeEventListener('touchend', handleTouchEnd);
          }
        };
      }

      // Log that we added keyboard listeners
      terminalAddMobileDebug('Added keydown listener to container');
      terminalAddMobileDebug(`Current sessionId: ${sessionId}`);
      terminalAddMobileDebug(`WebSocket connected: ${isConnected}`);

      // Handle terminal input - THIS IS CRITICAL FOR TYPING
      terminal.onData((data) => {
        // Track when onData was called
        (window as any).lastOnDataTime = Date.now();
        
        // Filter out device attribute responses to prevent loops
        const deviceAttributePatterns = [
          /^\x1b\[>0;276;0c$/,  // Secondary Device Attribute response
          /^\x1b\[\?1;2c$/,      // Primary Device Attribute response
          /^\x1b\]10;rgb:[0-9a-f\/]+\x1b\\$/,  // OSC 10 (foreground color)
          /^\x1b\]11;rgb:[0-9a-f\/]+\x1b\\$/   // OSC 11 (background color)
        ];
        
        const isDeviceAttribute = deviceAttributePatterns.some(pattern => pattern.test(data));
        if (isDeviceAttribute) {
          return; // Don't send device attributes to prevent loops
        }
        
        // Send input to backend
        if (sessionId && client) {
          try {
            client.sendTerminalData(sessionId, data);
          } catch (error) {
            console.error('Terminal input error:', error);
            terminal.write('\r\n\x1b[31mSession disconnected. Please reconnect.\x1b[0m\r\n');
          }
        }
      });

      // Minimal custom key handler - only for critical shortcuts that xterm might not handle
      terminal.attachCustomKeyEventHandler((event) => {
        // Only handle keydown events
        if (event.type !== 'keydown') {
          return true;
        }

        // Let xterm.js handle all normal input through onData
        // Only intercept if absolutely necessary
        return true; // Let xterm handle everything normally
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
      if (subscribeToSession) {
        subscribeToSession(sessionId);
      }

      // Listen for terminal output
      const handleTerminalOutput = (message: any) => {
        terminalAddMobileDebug(`Output event received!`);
        terminalAddMobileDebug(`  Message sessionId: ${message.sessionId}`);
        terminalAddMobileDebug(`  Our sessionId: ${sessionId}`);
        terminalAddMobileDebug(`  Match: ${message.sessionId === sessionId}`);
        if (message.sessionId === sessionId && message.data) {
          terminalAddMobileDebug(`Output: ${message.data.length} bytes`);
          // Show first few characters of output
          const preview = message.data.substring(0, 20).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          terminalAddMobileDebug(`  Preview: "${preview}"`);
          terminal.write(message.data);
          terminalAddMobileDebug(`Written to terminal`);
        } else if (!message.data) {
          terminalAddMobileDebug(`  No data in message`);
        }
      };

      // Get WebSocket client - prefer hook client, fallback to window client
      const wsClient = client || (window as any).__webSocketClient;
      if (wsClient) {
        // Remove any existing listeners first to avoid duplicates
        wsClient.removeAllListeners('terminal_output');
        wsClient.on('terminal_output', handleTerminalOutput);
        terminalAddMobileDebug(`Attached terminal_output listener (${client ? 'hook' : 'window'} client)`);
      } else {
        terminalAddMobileDebug(`ERROR: No WebSocket client available!`);
      }

      setIsInitialized(true);

      // Write initial buffer if available
      if (initialBuffer && initialBuffer.length > 0) {
        terminalAddMobileDebug(`Initial buffer: ${initialBuffer.length} bytes`);
        try {
          // Small delay to ensure terminal is ready
          setTimeout(() => {
            if (terminalRef.current && terminal === terminalRef.current && !terminal.element?.hasAttribute('data-buffer-written')) {
              try {
                terminal.write(initialBuffer);
                terminalAddMobileDebug(`Initial buffer written`);
                terminal.element?.setAttribute('data-buffer-written', 'true');
                
                // Refresh the terminal to ensure content is visible
                terminal.refresh(0, terminal.rows - 1);
                terminal.scrollToBottom();
              } catch (writeError) {
                terminalAddMobileDebug(`Failed to write buffer: ${writeError}`);
              }
            } else {
              terminalAddMobileDebug(`Terminal no longer current or buffer already written`);
            }
          }, 50);
        } catch (bufferError) {
          terminalAddMobileDebug(`Buffer write error: ${bufferError}`);
        }
      } else {
        terminalAddMobileDebug(`No initial buffer`);
      }

      // Try to focus and refresh again after a delay
      setTimeout(() => {
        terminal.focus();
        const textarea = terminalContainerRef.current?.querySelector('textarea');
        if (textarea) {
          (textarea as HTMLTextAreaElement).focus();
          terminalAddMobileDebug(`Re-focused terminal`);
          
          // Add a test to verify focus
          setTimeout(() => {
            const hasFocus = document.activeElement === textarea;
            terminalAddMobileDebug(`Terminal has focus: ${hasFocus}`);
            
            // Add keyboard listener directly to textarea
            if (!textarea.hasAttribute('data-keyboard-listener')) {
              textarea.setAttribute('data-keyboard-listener', 'true');
              textarea.addEventListener('keydown', (e) => {
                terminalAddMobileDebug(`Textarea keydown: ${e.key}`);
              });
              terminalAddMobileDebug('Added keydown listener to textarea');
            }
            
            // Add a global listener temporarily for debugging
            const globalHandler = (e: KeyboardEvent) => {
              const target = e.target as HTMLElement;
              terminalAddMobileDebug(`Global keydown: ${e.key} on ${target.tagName}.${target.className}`);
              // Check if this is the terminal textarea
              if (target === textarea) {
                terminalAddMobileDebug(`✓ Key captured on terminal textarea`);
              }
            };
            document.addEventListener('keydown', globalHandler);
            terminalAddMobileDebug('Added global keydown listener');
            
            // Get client from outer scope
            const outerClient = client;
            const outerSessionId = sessionId;
            
            // Debug WebSocket client availability
            terminalAddMobileDebug(`WebSocket client check:`);
            terminalAddMobileDebug(`  From hook: ${client ? '✓' : '✗'}`);
            terminalAddMobileDebug(`  From window: ${(window as any).__webSocketClient ? '✓' : '✗'}`);
            if ((window as any).__webSocketClient) {
              terminalAddMobileDebug(`  Is connected: ${(window as any).__webSocketClient.isConnected() ? '✓' : '✗'}`);
            }
            
            // Also add to window to catch all events
            const windowHandler = (e: KeyboardEvent) => {
              const target = e.target as HTMLElement;
              terminalAddMobileDebug(`Window keydown: ${e.key} on ${target.tagName}.${target.className}`);
              
              // Check event details
              if (e.bubbles) {
                terminalAddMobileDebug(`  Event is bubbling, prevented: ${e.defaultPrevented}`);
              }
              
              // Check if this is our textarea
              if (target === textarea) {
                terminalAddMobileDebug(`  ✓ Event on our textarea!`);
                // Debug the conditions
                terminalAddMobileDebug(`  SessionId: ${outerSessionId ? '✓' : '✗'} (${outerSessionId || 'null'})`);
                terminalAddMobileDebug(`  Client: ${outerClient ? '✓' : '✗'}`);
                terminalAddMobileDebug(`  Key length: ${e.key.length}`);
                
                // Try to manually send the key using the global WebSocket client
                if (outerSessionId) {
                  terminalAddMobileDebug(`  Attempting to send via global client`);
                  
                  // Get the WebSocket client directly from window
                  const wsClient = (window as any).__webSocketClient;
                  if (wsClient && wsClient.isConnected()) {
                    terminalAddMobileDebug(`  ✓ Found connected WebSocket client`);
                    
                    // Convert key to proper terminal input
                    let data = e.key;
                    if (e.key === 'Enter') {
                      data = '\r';
                    } else if (e.key === 'Tab') {
                      data = '\t';
                    } else if (e.key === 'Escape') {
                      data = '\x1b';
                    } else if (e.key === 'Backspace') {
                      data = '\x7f';
                    // Arrow keys removed - let xterm handle them to prevent duplicate events
                    } else if (e.ctrlKey && e.key.length === 1) {
                      // Handle Ctrl+key combinations
                      const code = e.key.toUpperCase().charCodeAt(0) - 64;
                      if (code >= 1 && code <= 26) {
                        data = String.fromCharCode(code);
                      }
                    } else if (e.key.length > 1) {
                      // Skip other special keys
                      terminalAddMobileDebug(`  Skipping special key: ${e.key}`);
                      return;
                    }
                    
                    wsClient.sendTerminalData(outerSessionId, data);
                    terminalAddMobileDebug(`  ✓ Sent "${e.key}" (as ${JSON.stringify(data)}) to backend`);
                  } else {
                    terminalAddMobileDebug(`  ✗ No connected WebSocket client`);
                  }
                } else {
                  terminalAddMobileDebug(`  Cannot send: no sessionId`);
                }
              }
            };
            window.addEventListener('keydown', windowHandler, true);
            
            // Store for cleanup
            (window as any).__terminalWindowHandler = windowHandler;
            
            // Remove after 30 seconds
            setTimeout(() => {
              document.removeEventListener('keydown', globalHandler);
              terminalAddMobileDebug('Removed global keydown listener');
            }, 30000);
          }, 100);
        }
        
        // Force another fit in case container size changed
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            terminalAddMobileDebug(`Re-fit: ${dims.cols}x${dims.rows}`);
            // Send resize again
            const refitClient = client || (window as any).__webSocketClient;
            if (sessionId && refitClient) {
              refitClient.sendRaw({
                type: 'resize_terminal',
                sessionId,
                cols: dims.cols,
                rows: dims.rows
              } as any);
            }
          }
        } catch (e) {
          terminalAddMobileDebug(`Re-fit error: ${e}`);
        }
        
        // Don't write test string - it confuses the terminal output
      }, 500);

      // Set up resize observer
      const resizeObserver = new ResizeObserver(() => {
        if (terminalRef.current) {
          handleResize();
        }
      });
      
      if (terminalContainerRef.current) {
        resizeObserver.observe(terminalContainerRef.current);
      }

      // Store cleanup function references
      cleanupHandlersRef.current.handleDirectKeydown = handleDirectKeydown;
      cleanupHandlersRef.current.handleInput = handleInput;
      cleanupHandlersRef.current.textarea = textarea;
      
      // Cleanup
      return () => {
        if (addLog) {
          addLog(`[TerminalView] Cleaning up terminal for session: ${sessionId}`);
        }
        
        // Use the same client resolution logic for cleanup
        const cleanupClient = client || (window as any).__webSocketClient;
        if (cleanupClient) {
          cleanupClient.off('terminal_output', handleTerminalOutput);
        }
        
        if (sessionId && unsubscribeFromSession) {
          unsubscribeFromSession(sessionId);
        }
        
        // Remove event listeners
        if (terminalContainerRef.current && cleanupHandlersRef.current.handleDirectKeydown) {
          terminalContainerRef.current.removeEventListener('keydown', cleanupHandlersRef.current.handleDirectKeydown);
        }
        if (cleanupHandlersRef.current.textarea && cleanupHandlersRef.current.handleInput) {
          cleanupHandlersRef.current.textarea.removeEventListener('input', cleanupHandlersRef.current.handleInput);
        }
        
        // Clean up global handlers
        if ((window as any).__terminalWindowHandler) {
          window.removeEventListener('keydown', (window as any).__terminalWindowHandler, true);
          delete (window as any).__terminalWindowHandler;
        }
        
        try {
          resizeObserver.disconnect();
        } catch (e) {
          console.error('Error disconnecting resize observer:', e);
        }
        
        // Only dispose if this terminal instance owns the terminal ref
        if (terminal && terminalRef.current === terminal) {
          try {
            terminal.dispose();
          } catch (e) {
            console.error('Error disposing terminal:', e);
          }
          terminalRef.current = null;
          fitAddonRef.current = null;
          searchAddonRef.current = null;
        }
        
        initializingRef.current = false;
        setIsInitialized(false);
      };
    }, [sessionId]); // Only re-run when sessionId changes to prevent multiple initializations

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

    // Virtual keyboard button handlers
    const handleVirtualKey = useCallback((key: string) => {
      addMobileDebug(`VKey: ${key}`);
      
      if (!sessionId) {
        addMobileDebug(`No session ID`);
        return;
      }

      if (!terminalRef.current) {
        addMobileDebug(`No terminal ref`);
        return;
      }

      let data = '';
      switch (key) {
        case 'ArrowUp':
          data = '\x1b[A';
          break;
        case 'ArrowDown':
          data = '\x1b[B';
          break;
        case 'ArrowLeft':
          data = '\x1b[D';
          break;
        case 'ArrowRight':
          data = '\x1b[C';
          break;
        case 'Escape':
          data = '\x1b';
          break;
        case 'Ctrl+C':
          data = '\x03';
          break;
        case 'Tab':
          data = '\t';
          break;
        case 'Enter':
          data = '\r';
          break;
        default:
          addMobileDebug(`Unknown key: ${key}`);
          return;
      }

      addMobileDebug(`VKey data: ${JSON.stringify(data)}`);

      try {
        // For arrow keys and control characters, don't write directly to terminal
        // Let the backend response handle the display to avoid double input
        const isNavigationKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
        
        if (!isNavigationKey) {
          // Only write visible characters directly to terminal
          terminalRef.current.write(data);
        }
        
        // Always send to backend
        sendTerminalData(sessionId, data);
        addMobileDebug(`VKey sent: ${key}`);
        
        // Keep terminal focused
        terminalRef.current.focus();
      } catch (error) {
        addMobileDebug(`VKey error: ${error}`);
      }
    }, [sessionId, sendTerminalData, addMobileDebug]); // Added addMobileDebug dependency

    // Test function to manually trigger terminal output
    useEffect(() => {
      (window as any).testTerminalOutput = (data: string) => {
        if (terminalRef.current && sessionId) {
          addMobileDebug(`TEST: Writing "${data}" to terminal`);
          terminalRef.current.write(data);
        }
      };
      return () => {
        delete (window as any).testTerminalOutput;
      };
    }, [sessionId, addMobileDebug]);

    // Use the memoized addMobileDebug from above

    return (
      <div className="h-full w-full bg-black relative flex flex-col" style={{ overflow: 'hidden', minHeight: '100px' }}>
        {/* Debug Panel - Compact corner version with hide/show toggle */}
        {mobileDebug.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-gray-900 bg-opacity-95 z-40 border border-gray-700 rounded shadow-lg">
            {debugVisible ? (
              // Full debug panel when visible
              <div className="p-2 text-xs text-gray-300 max-h-32 max-w-sm overflow-y-auto">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-bold text-yellow-400 text-xs">Debug:</div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setDebugVisible(false)}
                      className="text-gray-400 hover:text-gray-300 text-xs px-1"
                      title="Hide debug panel"
                    >
                      –
                    </button>
                    <button 
                      onClick={() => setMobileDebug([])}
                      className="text-red-400 hover:text-red-300 text-xs px-1"
                      title="Clear debug messages"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {mobileDebug.slice(-5).map((msg, i) => {
                    // Color code different message types
                    let className = "font-mono text-xs ";
                    if (msg.includes('[WebSocket]')) {
                      className += "text-blue-300";
                    } else if (msg.includes('✓')) {
                      className += "text-green-400";
                    } else if (msg.includes('✗')) {
                      className += "text-red-400";
                    } else if (msg.includes('Output')) {
                      className += "text-purple-400";
                    } else if (msg.includes('Sent')) {
                      className += "text-yellow-400";
                    } else {
                      className += "text-gray-400";
                    }
                    return <div key={i} className={className}>{msg}</div>;
                  })}
                </div>
              </div>
            ) : (
              // Minimized debug indicator when hidden
              <div className="p-1">
                <button 
                  onClick={() => setDebugVisible(true)}
                  className="text-yellow-400 hover:text-yellow-300 text-xs px-2 py-1 rounded"
                  title="Show debug panel"
                >
                  🐛 {mobileDebug.length}
                </button>
              </div>
            )}
          </div>
        )}
        {(status === 'disconnected' || status === 'error') && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <p className="text-lg mb-4">{getStatusMessage()}</p>
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
        {status === 'connecting' && !sessionId && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <p className="text-lg mb-4">Connecting to terminal session...</p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            </div>
          </div>
        )}
        <div 
          ref={terminalContainerRef} 
          className="flex-1"
          style={{ 
            padding: '4px',
            paddingTop: showVirtualKeyboard ? '160px' : '4px',
            height: '100%',
            minHeight: '200px',
            minWidth: isMobile ? '100%' : '400px',
            pointerEvents: 'auto',
            position: 'relative',
            backgroundColor: '#000000',
            // Ensure the container can receive the xterm canvas
            display: status === 'connected' || status === 'connecting' ? 'block' : 'none',
            // Force visibility
            visibility: 'visible',
            opacity: 1
          }}
          onClick={() => {
            if (addLog) {
              addLog(`[TerminalView] Terminal clicked, status: ${status}, has term ref: ${!!terminalRef.current}`);
            }
            if (!terminalRef.current) {
              addMobileDebug(`Terminal ref not available`);
              return;
            }
            if (terminalRef.current) {
              terminalRef.current.focus();
              // Also try to focus the textarea directly
              const textarea = terminalContainerRef.current?.querySelector('textarea');
              if (textarea) {
                (textarea as HTMLTextAreaElement).focus();
                addMobileDebug(`Textarea focused`);
                
                // Test if we can capture input
                setTimeout(() => {
                  const testInput = document.activeElement;
                  addMobileDebug(`Active element: ${testInput?.tagName} ${testInput?.className}`);
                  if (testInput && testInput.tagName === 'TEXTAREA') {
                    addMobileDebug(`✓ Textarea is active, keyboard should work`);
                    // Check WebSocket status
                    const wsConnected = client?.isConnected() || false;
                    addMobileDebug(`WebSocket connected: ${wsConnected}`);
                    if (!wsConnected) {
                      addMobileDebug(`✗ WebSocket disconnected!`);
                    }
                  } else {
                    addMobileDebug(`✗ Wrong element focused`);
                  }
                }, 50);
              }
              // Check if terminal has focus
              const hasFocus = document.activeElement === textarea;
              addMobileDebug(`Has focus: ${hasFocus}`);
            }
            // Don't auto-show keyboard on mobile, let user toggle it
          }}
          onFocus={() => {
            if (addLog) {
              addLog(`[TerminalView] Terminal container focused`);
            }
            if (terminalRef.current) {
              terminalRef.current.focus();
            }
          }}
          tabIndex={0}
        >
          {/* Fallback content if terminal doesn't render */}
          {status === 'connected' && !terminalRef.current && (
            <div style={{ 
              color: 'white', 
              padding: '20px', 
              fontFamily: 'monospace',
              fontSize: '14px',
              backgroundColor: 'black'
            }}>
              <div style={{ color: '#00ff00' }}>Terminal container is ready but xterm not initialized.</div>
              <div style={{ color: '#ffff00' }}>Session ID: {sessionId}</div>
              <div style={{ color: '#00ffff' }}>Status: {status}</div>
              <div style={{ color: '#ff00ff' }}>Please check browser console for errors.</div>
            </div>
          )}
        </div>
        
        {/* Remove floating keyboard button since we have it in the header */}
        
        {/* Virtual Keyboard - Slide from top */}
        {showVirtualKeyboard && status === 'connected' && (
          <div className="fixed top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 shadow-lg z-50 transform transition-transform duration-300 translate-y-0">
          <div className="p-3">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-300">Virtual Keyboard</span>
              <button
                onClick={() => onVirtualKeyboardToggle && onVirtualKeyboardToggle()}
                className="text-gray-400 hover:text-white text-lg px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[VirtualKeyboard] ESC button pressed');
                  handleVirtualKey('Escape');
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[VirtualKeyboard] ESC button touched');
                  handleVirtualKey('Escape');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm font-medium rounded transition-colors touch-target select-none"
              >
                ESC
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addMobileDebug('TAB clicked');
                  handleVirtualKey('Tab');
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addMobileDebug('TAB touched');
                  handleVirtualKey('Tab');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm font-medium rounded transition-colors touch-target select-none cursor-pointer"
              >
                TAB
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('Ctrl+C');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm font-medium rounded transition-colors touch-target"
              >
                CTRL+C
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('Enter');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm font-medium rounded transition-colors touch-target"
              >
                ENTER
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('ArrowLeft');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xl rounded transition-colors touch-target"
              >
                ←
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('ArrowUp');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xl rounded transition-colors touch-target"
              >
                ↑
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('ArrowDown');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xl rounded transition-colors touch-target"
              >
                ↓
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleVirtualKey('ArrowRight');
                }}
                className="px-3 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xl rounded transition-colors touch-target"
              >
                →
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }
);

TerminalView.displayName = 'TerminalView';