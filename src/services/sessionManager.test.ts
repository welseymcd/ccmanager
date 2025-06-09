import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {SessionState} from '../types/index.js';

// Mock the promptDetector module
vi.mock('../utils/promptDetector.js', () => ({
	includesPromptBoxBottomBorder: vi.fn(),
}));

import {includesPromptBoxBottomBorder} from '../utils/promptDetector.js';

describe('SessionManager', () => {
	let sessionManager: SessionManager;
	const mockSessionId = 'test-session-123';

	beforeEach(() => {
		sessionManager = new SessionManager();
		vi.clearAllMocks();
	});

	describe('detectSessionState', () => {
		it('should detect waiting_input state when "Do you want" prompt is present', () => {
			const cleanData = '│ Do you want to continue?';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
		});

		it('should set waitingWithBottomBorder when waiting prompt and bottom border are both present', () => {
			const cleanData = '│ Do you want to continue?\n└───────────────────────┘';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
			// The internal map should have been set to true
		});

		it('should maintain waiting_input state when bottom border appears after waiting prompt', () => {
			const cleanData = '└───────────────────────┘';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			// First call to set up the waiting state without bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			sessionManager.detectSessionState(
				'│ Do you want to continue?',
				'idle',
				mockSessionId,
			);

			// Now test the bottom border appearing
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
		});

		it('should detect busy state when "esc to interrupt" is present', () => {
			const cleanData = 'Processing... Press ESC to interrupt';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should detect idle state when no specific patterns are found', () => {
			const cleanData = 'Some regular output text';
			const currentState: SessionState = 'busy';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('idle');
		});

		it('should handle case-insensitive "esc to interrupt" detection', () => {
			const cleanData = 'Running task... PRESS ESC TO INTERRUPT';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should not change from waiting_input when bottom border was already seen', () => {
			const cleanData = '└───────────────────────┘';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			// First, simulate seeing waiting prompt with bottom border
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now another bottom border appears
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('idle'); // Should change to idle since we already saw the bottom border
		});

		it('should clear waitingWithBottomBorder flag when transitioning to busy', () => {
			const cleanData = 'Processing... Press ESC to interrupt';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			// First set up waiting state with bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now transition to busy
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should clear waitingWithBottomBorder flag when transitioning to idle', () => {
			const cleanData = 'Task completed successfully';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			// First set up waiting state with bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now transition to idle
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('idle');
		});
	});
});
