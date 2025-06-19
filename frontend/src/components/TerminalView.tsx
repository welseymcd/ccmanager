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
        addMobileDebug(`Writing initial buffer to terminal: ${initialBuffer.length} bytes`);
        terminalRef.current.write(initialBuffer);
        // Mark that we've written the buffer to avoid duplicate writes
        terminalRef.current.element?.setAttribute('data-buffer-written', 'true');
      }
    }, [initialBuffer, addMobileDebug]);

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
      
      // Additional check to prevent multiple terminals for the same session
      const existingTerminal = document.querySelector(`[data-session-id="${sessionId}"]`);
      if (existingTerminal) {
        if (addLog) {
          addLog(`[TerminalView] Terminal element already exists for session ${sessionId}, skipping...`);
        }
        return;
      }
      
      initializingRef.current = true;

      // Log terminal creation
      const debugMsg = `Creating terminal - sessionId: ${sessionId}`;
      addMobileDebug(debugMsg);
      if (addLog) {
        addLog(`[TerminalView] Creating terminal instance - mobile: ${isMobile}, sessionId: ${sessionId}`);
      }

      // Create terminal instance with mobile-friendly options
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: isMobile ? 12 : 14,
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
        // Use canvas renderer for better compatibility
        rendererType: 'canvas',
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
      terminal.open(terminalContainerRef.current);
      
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
      
      // Add a direct keyboard event listener as a fallback
      const handleDirectKeydown = (e: KeyboardEvent) => {
        // Always log the keypress to debug panel
        const keyInfo = `Key: ${e.key}${e.ctrlKey ? ' +Ctrl' : ''}${e.altKey ? ' +Alt' : ''}${e.metaKey ? ' +Meta' : ''}${e.shiftKey ? ' +Shift' : ''}`;
        terminalAddMobileDebug(keyInfo);
        
        // Track when onData was last called
        const lastOnDataTime = (window as any).lastOnDataTime || 0;
        const timeSinceLastOnData = Date.now() - lastOnDataTime;
        
        // Log timing info
        if (timeSinceLastOnData > 1000) {
          terminalAddMobileDebug(`onData last fired: ${Math.round(timeSinceLastOnData / 1000)}s ago`);
        } else {
          terminalAddMobileDebug(`onData last fired: ${timeSinceLastOnData}ms ago`);
        }
        
        // Always handle input directly for now since onData isn't working
        if (timeSinceLastOnData > 50) {
          // Handle printable characters
          if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            terminalAddMobileDebug(`Sending char: "${e.key}"`);
            e.preventDefault();
            if (sessionId && client) {
              client.sendTerminalData(sessionId, e.key);
              // Also write to terminal to show the character
              terminal.write(e.key);
              terminalAddMobileDebug(`✓ Sent to backend`);
            } else {
              terminalAddMobileDebug(`✗ No session/client`);
            }
          }
          // Handle special keys
          else if (sessionId && client) {
            let handled = false;
            let data = '';
            let keyName = '';
            
            switch (e.key) {
              case 'Enter':
                data = '\r';
                keyName = 'ENTER';
                handled = true;
                break;
              case 'Backspace':
                data = '\x7f';
                keyName = 'BACKSPACE';
                handled = true;
                break;
              case 'Tab':
                data = '\t';
                keyName = 'TAB';
                handled = true;
                break;
              case 'Escape':
                data = '\x1b';
                keyName = 'ESC';
                handled = true;
                break;
              case 'ArrowUp':
                data = '\x1b[A';
                keyName = '↑';
                handled = true;
                break;
              case 'ArrowDown':
                data = '\x1b[B';
                keyName = '↓';
                handled = true;
                break;
              case 'ArrowRight':
                data = '\x1b[C';
                keyName = '→';
                handled = true;
                break;
              case 'ArrowLeft':
                data = '\x1b[D';
                keyName = '←';
                handled = true;
                break;
            }
            
            // Handle Ctrl+C specially
            if (e.ctrlKey && e.key.toLowerCase() === 'c') {
              data = '\x03';
              keyName = 'CTRL+C';
              handled = true;
            }
            
            if (handled) {
              e.preventDefault();
              terminalAddMobileDebug(`Sending special: ${keyName}`);
              if (client) {
                client.sendTerminalData(sessionId, data);
                terminalAddMobileDebug(`✓ Sent ${keyName}`);
              }
            } else if (e.ctrlKey || e.altKey || e.metaKey) {
              terminalAddMobileDebug(`Unhandled combo: ${keyInfo}`);
            }
          }
        } else {
          terminalAddMobileDebug(`onData should handle this`);
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
        
        // Log onData with better formatting
        if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
          terminalAddMobileDebug(`✅ onData fired: "${data}"`);
        } else {
          const hex = Array.from(data).map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          terminalAddMobileDebug(`✅ onData fired: ${hex}`);
        }
        
        // Don't filter normal typing input - only filter problematic device responses
        const deviceAttributePatterns = [
          /^\x1b\[>0;276;0c$/,  // Secondary Device Attribute response
          /^\x1b\[\?1;2c$/,      // Primary Device Attribute response
          /^\x1b\]10;rgb:[0-9a-f\/]+\x1b\\$/,  // OSC 10 (foreground color)
          /^\x1b\]11;rgb:[0-9a-f\/]+\x1b\\$/   // OSC 11 (background color)
        ];
        
        // Check if this is a device attribute response
        const isDeviceAttribute = deviceAttributePatterns.some(pattern => pattern.test(data));
        
        if (isDeviceAttribute) {
          terminalAddMobileDebug(`Filtered device attribute`);
          return; // Don't send device attributes to prevent loops
        }
        
        // Send ALL other input to the backend
        if (sessionId) {
          terminalAddMobileDebug(`Have sessionId: ${sessionId}, WS connected: ${client?.isConnected() || false}`);
          try {
            if (!client) {
              terminalAddMobileDebug(`ERROR: WebSocket client not available!`);
              throw new Error('WebSocket client not available');
            }
            // Actually send the data
            terminalAddMobileDebug(`Calling sendTerminalData with: ${JSON.stringify(data)}`);
            if (client) {
              client.sendTerminalData(sessionId, data);
            }
            terminalAddMobileDebug(`✓ Successfully sent to backend`);
          } catch (error) {
            terminalAddMobileDebug(`✗ Send error: ${error}`);
            terminal.write('\r\n\x1b[31mSession disconnected. Please create a new session.\x1b[0m\r\n');
          }
        } else {
          terminalAddMobileDebug(`ERROR: No sessionId available for input!`);
        }
      });

      // Handle keyboard shortcuts - ONLY intercept special keys, let normal typing through
      terminal.attachCustomKeyEventHandler((event) => {
        // Only handle keydown events
        if (event.type !== 'keydown') {
          return true;
        }

        // Let normal typing characters pass through to xterm's default handler
        // Only intercept special navigation keys
        
        // Handle Ctrl+C ONLY when actually pressed together
        if (event.ctrlKey && event.key.toLowerCase() === 'c' && !event.altKey && !event.shiftKey) {
          terminalAddMobileDebug(`Ctrl+C intercepted`);
          event.preventDefault();
          if (sessionId) {
            sendTerminalData(sessionId, '\x03');
          }
          return false;
        }

        // Handle Escape key
        if (event.key === 'Escape' && !event.ctrlKey && !event.altKey) {
          terminalAddMobileDebug(`Escape intercepted`);
          event.preventDefault();
          if (sessionId) {
            sendTerminalData(sessionId, '\x1b');
          }
          return false;
        }

        // Handle Arrow keys ONLY
        if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          terminalAddMobileDebug(`Arrow key: ${event.key}`);
          if (sessionId) {
            switch (event.key) {
              case 'ArrowUp':
                sendTerminalData(sessionId, '\x1b[A');
                break;
              case 'ArrowDown':
                sendTerminalData(sessionId, '\x1b[B');
                break;
              case 'ArrowRight':
                sendTerminalData(sessionId, '\x1b[C');
                break;
              case 'ArrowLeft':
                sendTerminalData(sessionId, '\x1b[D');
                break;
            }
          }
          return false;
        }

        // Let all other keys (typing) pass through to xterm's default handler
        terminalAddMobileDebug(`Key passed through: ${event.key}`);
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
          // Write the buffer without clearing first to preserve tmux state
          terminal.write(initialBuffer);
          terminalAddMobileDebug(`Initial buffer written`);
          terminal.element?.setAttribute('data-buffer-written', 'true');
          
          // Refresh the terminal to ensure content is visible
          terminal.refresh(0, terminal.rows - 1);
          terminal.scrollToBottom();
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
                    } else if (e.key === 'ArrowUp') {
                      data = '\x1b[A';
                    } else if (e.key === 'ArrowDown') {
                      data = '\x1b[B';
                    } else if (e.key === 'ArrowRight') {
                      data = '\x1b[C';
                    } else if (e.key === 'ArrowLeft') {
                      data = '\x1b[D';
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
        handleResize();
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
        
        resizeObserver.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
        initializingRef.current = false;
        setIsInitialized(false);
      };
    }, [sessionId, status, isMobile]); // Removed client, addLog, isConnected, initialBuffer to prevent loops

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
        // Write directly to terminal to see it
        terminalRef.current.write(data);
        
        // Send to backend
        sendTerminalData(sessionId, data);
        addMobileDebug(`VKey sent`);
        
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
      <div className="h-full w-full bg-black relative flex flex-col overflow-hidden">
        {/* Mobile Debug Panel - Compact corner version */}
        {mobileDebug.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-gray-900 bg-opacity-95 p-2 z-40 text-xs text-gray-300 max-h-32 max-w-sm overflow-y-auto border border-gray-700 rounded shadow-lg">
            <div className="flex justify-between items-center mb-1">
              <div className="font-bold text-yellow-400 text-xs">Debug:</div>
              <button 
                onClick={() => setMobileDebug([])}
                className="text-red-400 hover:text-red-300 text-xs px-1"
              >
                ✕
              </button>
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
        )}
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
          className={`flex-1 overflow-hidden ${status !== 'connected' ? 'hidden' : 'block'}`}
          style={{ 
            padding: '4px',
            paddingTop: showVirtualKeyboard ? '160px' : '4px',
            height: '100%',
            minHeight: '200px',
            minWidth: isMobile ? '100%' : '400px',
            pointerEvents: 'auto',
            position: 'relative',
            backgroundColor: '#000000'
          }}
          onClick={(e) => {
            addMobileDebug(`Terminal clicked`);
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
        />
        
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