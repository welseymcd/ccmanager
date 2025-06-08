import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import type {IPty} from 'node-pty';

// Create a mock PTY type
interface MockPty extends Partial<IPty> {
	dataHandler?: (data: string) => void;
	exitHandler?: () => void;
}

// Mock node-pty
vi.mock('node-pty', () => ({
	spawn: vi.fn(() => {
		const mockPty: MockPty = {
			pid: 1234,
			cols: 80,
			rows: 24,
			process: 'mock',
			handleFlowControl: false,
			write: vi.fn(),
			kill: vi.fn(),
			resize: vi.fn(),
			onData: ((handler: (data: string) => void) => {
				mockPty.dataHandler = handler;
				return {dispose: () => {}};
			}) as IPty['onData'],
			onExit: ((handler: (e: {exitCode: number; signal?: number}) => void) => {
				mockPty.exitHandler = () => handler({exitCode: 0});
				return {dispose: () => {}};
			}) as IPty['onExit'],
		};
		return mockPty;
	}),
}));

describe('SessionManager - Idle Detection', () => {
	let sessionManager: SessionManager;
	let mockPty: MockPty;

	beforeEach(() => {
		sessionManager = new SessionManager();
		const session = sessionManager.createSession('/test/path');
		mockPty = session.process as MockPty;
	});

	afterEach(() => {
		sessionManager.destroy();
		vi.clearAllMocks();
	});

	describe('esc to interrupt detection', () => {
		it('should detect "esc to interrupt" in output', async () => {
			const session = sessionManager.getSession('/test/path')!;
			const stateChanges: string[] = [];

			sessionManager.on('sessionStateChanged', changedSession => {
				if (changedSession.id === session.id) {
					stateChanges.push(changedSession.state);
				}
			});

			// Simulate output with "esc to interrupt"
			mockPty.dataHandler!('Working on task... esc to interrupt');

			// Wait for state detection
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('busy');
		});

		it('should transition to idle after "esc to interrupt" with non-prompt output', async () => {
			const session = sessionManager.getSession('/test/path')!;
			const stateChanges: string[] = [];

			sessionManager.on('sessionStateChanged', changedSession => {
				if (changedSession.id === session.id) {
					stateChanges.push(changedSession.state);
				}
			});

			// First, send "esc to interrupt"
			mockPty.dataHandler!('Working on task... esc to interrupt');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Then send non-prompt output
			mockPty.dataHandler!('Task completed successfully\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should transition to idle
			expect(session.state).toBe('idle');
		});

		it('should NOT immediately transition to idle after "esc to interrupt" with prompt box output', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Track state changes
			const stateChanges: string[] = [];
			sessionManager.on('sessionStateChanged', changedSession => {
				if (changedSession.id === session.id) {
					stateChanges.push(changedSession.state);
				}
			});

			// First, send "esc to interrupt"
			mockPty.dataHandler!('Working on task... esc to interrupt');
			await new Promise(resolve => setTimeout(resolve, 600));
			expect(session.state).toBe('busy');

			// Then send prompt box output - this should be ignored
			const promptBox = `╭────────────────╮
│ >              │
╰────────────────╯`;
			mockPty.dataHandler!(promptBox);
			await new Promise(resolve => setTimeout(resolve, 600));

			// Should still be busy immediately after prompt box
			expect(session.state).toBe('busy');

			// But it's ok if it eventually transitions to idle after timeout
			// This test is about not immediately transitioning to idle when we get prompt box
		});
	});

	describe('state transitions', () => {
		it('should transition to waiting_input when prompt is detected', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Simulate Claude prompt
			mockPty.dataHandler!('Ready for input\n> ');
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('waiting_input');
		});

		it('should transition to busy when receiving output', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Start in idle state
			session.state = 'idle';

			// Simulate output
			mockPty.dataHandler!('Processing your request...\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('busy');
		});

		it('should transition to idle after 3 seconds of inactivity', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Simulate some output to make it busy first
			mockPty.dataHandler!('Task completed\n');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('busy');

			// Wait for more than 3 seconds without any new output
			// The periodic state detection should pick this up
			await new Promise(resolve => setTimeout(resolve, 3500));

			expect(session.state).toBe('idle');
		});
	});

	describe('complex scenarios', () => {
		it('should handle multiple state transitions correctly', async () => {
			const session = sessionManager.getSession('/test/path')!;
			const stateChanges: string[] = [];

			sessionManager.on('sessionStateChanged', changedSession => {
				if (changedSession.id === session.id) {
					stateChanges.push(changedSession.state);
				}
			});

			// Scenario: busy -> waiting_input -> busy -> idle

			// 1. Start with some work
			mockPty.dataHandler!('Working on task...\n');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('busy');

			// 2. Show prompt
			mockPty.dataHandler!('> ');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('waiting_input');

			// 3. User input and response
			mockPty.dataHandler!('Processing...\n');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('busy');

			// 4. Complete with "esc to interrupt" and then other output
			mockPty.dataHandler!('esc to interrupt\n');
			await new Promise(resolve => setTimeout(resolve, 100));
			mockPty.dataHandler!('All done!\n');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('idle');
		});

		it('should clear esc to interrupt tracker when appropriate', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Send "esc to interrupt"
			mockPty.dataHandler!('Working... esc to interrupt');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Send non-prompt output (should clear tracker)
			mockPty.dataHandler!('Task completed\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Now regular output should make it busy again
			mockPty.dataHandler!('Starting new task...\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('busy');
		});
	});

	describe('edge cases', () => {
		it('should handle empty output', async () => {
			const session = sessionManager.getSession('/test/path')!;
			const initialState = session.state;

			mockPty.dataHandler!('');
			await new Promise(resolve => setTimeout(resolve, 100));

			// State should not change for empty output
			expect(session.state).toBe(initialState);
		});

		it('should handle ANSI escape sequences', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Output with ANSI codes
			mockPty.dataHandler!('\x1b[32mSuccess!\x1b[0m esc to interrupt\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should still detect "esc to interrupt"
			mockPty.dataHandler!('Done\n');
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('idle');
		});

		it('should handle prompt box bottom border edge case', async () => {
			const session = sessionManager.getSession('/test/path')!;

			// Set to waiting state
			mockPty.dataHandler!('> ');
			await new Promise(resolve => setTimeout(resolve, 100));
			expect(session.state).toBe('waiting_input');

			// Send just bottom border (should stay in waiting state)
			mockPty.dataHandler!('╰────────────────╯');
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(session.state).toBe('waiting_input');
		});
	});
});
