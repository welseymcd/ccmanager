import { describe, it, expect, beforeEach } from 'vitest';
import { PromptDetector } from './promptDetector';

describe('PromptDetector', () => {
  let detector: PromptDetector;

  beforeEach(() => {
    detector = new PromptDetector();
  });

  describe('Busy state detection', () => {
    it('should detect busy state when "ESC to interrupt" is present', () => {
      const output = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n│ I\'m analyzing your code...\n│ ESC to interrupt\n';
      const state = detector.processOutput(output);
      expect(state).toBe('busy');
    });

    it('should detect busy state with different casing', () => {
      const output = 'Press ESC to stop the current operation';
      const state = detector.processOutput(output);
      expect(state).toBe('busy');
    });
  });

  describe('Waiting input state detection', () => {
    it('should detect waiting input for yes/no questions', () => {
      const output = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n│ I found some issues in your code.\n╰───────────────────────────────────────────────────────────────────────────────╯\nDo you want me to fix them? (y/n): ';
      const state = detector.processOutput(output);
      expect(state).toBe('waiting_input');
    });

    it('should detect waiting input for "Would you like" questions', () => {
      const output = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n│ I can help you refactor this code.\n╰───────────────────────────────────────────────────────────────────────────────╯\nWould you like me to proceed? ';
      const state = detector.processOutput(output);
      expect(state).toBe('waiting_input');
    });

    it('should detect waiting input without box when at start', () => {
      const output = 'Please confirm you want to continue (Y/n): ';
      const state = detector.processOutput(output);
      expect(state).toBe('waiting_input');
    });
  });

  describe('Idle state detection', () => {
    it('should detect idle state when box is complete', () => {
      const output1 = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n';
      detector.processOutput(output1);
      
      const output2 = '│ Here\'s the refactored code:\n│ function hello() { console.log("Hello"); }\n';
      detector.processOutput(output2);
      
      const output3 = '╰───────────────────────────────────────────────────────────────────────────────╯\n';
      const state = detector.processOutput(output3);
      expect(state).toBe('idle');
    });
  });

  describe('State transitions', () => {
    it('should transition from busy to idle when complete', () => {
      // Start with busy state
      const output1 = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n│ Working on your request...\n│ ESC to interrupt\n';
      let state = detector.processOutput(output1);
      expect(state).toBe('busy');

      // Complete the response
      const output2 = '│ Done!\n╰───────────────────────────────────────────────────────────────────────────────╯\n';
      state = detector.processOutput(output2);
      expect(state).toBe('idle');
    });
  });

  describe('Question extraction', () => {
    it('should extract the last question', () => {
      const output = '╭─ Claude ─────────────────────────────────────────────────────────────────────╮\n│ Analysis complete.\n╰───────────────────────────────────────────────────────────────────────────────╯\nShould I commit these changes? (y/n): ';
      detector.processOutput(output);
      const question = detector.getLastQuestion();
      expect(question).toBe('Should I commit these changes? (y/n):');
    });
  });

  describe('Reset functionality', () => {
    it('should reset state to idle', () => {
      const output = 'ESC to interrupt current operation';
      detector.processOutput(output);
      expect(detector.getCurrentState()).toBe('busy');
      
      detector.reset();
      expect(detector.getCurrentState()).toBe('idle');
    });
  });
});