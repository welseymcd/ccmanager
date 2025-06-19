import { SessionState } from '@shared/types';

/**
 * Detects Claude Code's current state based on terminal output patterns
 * Based on patterns documented in CLAUDE.md
 */
export class PromptDetector {
  // Box-drawing characters used by Claude
  private static readonly BOX_TOP = '╭';
  private static readonly BOX_BOTTOM = '╰';
  private static readonly BOX_SIDE = '│';
  
  // Patterns for different states
  private static readonly BUSY_PATTERNS = [
    /ESC to interrupt/i,
    /Press ESC to stop/i,
    /\[ESC\]/i
  ];
  
  private static readonly WAITING_INPUT_PATTERNS = [
    /Do you want/i,
    /Would you like/i,
    /Please confirm/i,
    /Continue\?/i,
    /\(y\/n\)/i,
    /\[Y\/n\]/i,
    /\[y\/N\]/i,
    /Enter your/i,
    /What would you/i,
    /Should I/i,
    /May I/i,
    /Can I/i,
    /Shall I/i
  ];
  
  // Track recent output to detect patterns
  private recentOutput: string[] = [];
  private readonly maxBufferLines = 50;
  private lastDetectedState: SessionState = 'idle';
  private hasSeenBoxTop = false;
  private hasSeenBoxBottom = false;
  
  /**
   * Process new terminal output and detect state
   */
  processOutput(output: string): SessionState {
    // Split into lines and add to buffer
    const lines = output.split('\n');
    this.recentOutput.push(...lines);
    
    // Keep buffer size limited
    if (this.recentOutput.length > this.maxBufferLines) {
      this.recentOutput = this.recentOutput.slice(-this.maxBufferLines);
    }
    
    // Check for box-drawing characters
    for (const line of lines) {
      if (line.includes(PromptDetector.BOX_TOP)) {
        this.hasSeenBoxTop = true;
        this.hasSeenBoxBottom = false;
      }
      if (line.includes(PromptDetector.BOX_BOTTOM)) {
        this.hasSeenBoxBottom = true;
      }
    }
    
    // Detect current state
    const currentState = this.detectState();
    this.lastDetectedState = currentState;
    return currentState;
  }
  
  /**
   * Get the current detected state
   */
  getCurrentState(): SessionState {
    return this.lastDetectedState;
  }
  
  /**
   * Reset the detector state
   */
  reset(): void {
    this.recentOutput = [];
    this.lastDetectedState = 'idle';
    this.hasSeenBoxTop = false;
    this.hasSeenBoxBottom = false;
  }
  
  private detectState(): SessionState {
    const recentText = this.recentOutput.join('\n');
    
    // If we've seen a complete box (top and bottom), check for prompts first
    if (this.hasSeenBoxTop && this.hasSeenBoxBottom) {
      // Check for waiting input state
      const lastFewLines = this.recentOutput.slice(-5).join('\n');
      for (const pattern of PromptDetector.WAITING_INPUT_PATTERNS) {
        if (pattern.test(lastFewLines)) {
          return 'waiting_input';
        }
      }
      // Box is complete and no prompt, so idle
      return 'idle';
    }
    
    // Check for busy state (ESC to interrupt) - only if box not complete
    for (const pattern of PromptDetector.BUSY_PATTERNS) {
      if (pattern.test(recentText)) {
        return 'busy';
      }
    }
    
    // Check for waiting input state without box (initial prompt)
    if (!this.hasSeenBoxTop) {
      const lastFewLines = this.recentOutput.slice(-5).join('\n');
      for (const pattern of PromptDetector.WAITING_INPUT_PATTERNS) {
        if (pattern.test(lastFewLines)) {
          return 'waiting_input';
        }
      }
    }
    
    // If we've seen box top but no bottom, Claude is still outputting
    if (this.hasSeenBoxTop && !this.hasSeenBoxBottom) {
      return 'busy';
    }
    
    // Default to idle
    return 'idle';
  }
  
  /**
   * Extract the last question from the output (useful for UI display)
   */
  getLastQuestion(): string | null {
    // Search backwards through recent output for a question
    for (let i = this.recentOutput.length - 1; i >= 0; i--) {
      const line = this.recentOutput[i];
      for (const pattern of PromptDetector.WAITING_INPUT_PATTERNS) {
        if (pattern.test(line)) {
          return line.trim();
        }
      }
    }
    return null;
  }
}