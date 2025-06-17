/**
 * Filter problematic escape sequences from terminal output
 * This helps prevent terminal corruption when multiple clients attach to tmux
 */
export function filterTerminalOutput(data: string): string {
  // Remove device attribute responses that can cause loops
  // These patterns match escape sequences like >0;276;0c and ?1;2c
  let filtered = data;
  
  // Remove Primary Device Attributes responses
  filtered = filtered.replace(/\x1b\[[0-9;]*c/g, '');
  filtered = filtered.replace(/>[0-9;]+c/g, '');
  
  // Remove Secondary Device Attributes responses  
  filtered = filtered.replace(/\x1b\[>[0-9;]+c/g, '');
  filtered = filtered.replace(/\?[0-9;]+c/g, '');
  
  // Remove cursor position reports that might be corrupted
  filtered = filtered.replace(/\x1b\[[0-9]+;[0-9]+R/g, '');
  
  // Remove any standalone escape characters that might cause issues
  filtered = filtered.replace(/\x1b(?![[\]>?])/g, '');
  
  return filtered;
}

/**
 * Check if output contains problematic escape sequences
 */
export function containsProblematicSequences(data: string): boolean {
  const patterns = [
    />[0-9;]+c/,      // Device attribute responses
    /\?[0-9;]+c/,     // Secondary device attributes
    /\x1b\[[0-9;]*c/, // Primary device attributes
    /\x1b\[>[0-9;]+c/ // More device attributes
  ];
  
  return patterns.some(pattern => pattern.test(data));
}