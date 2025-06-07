import {describe, it, expect} from 'vitest';
import {
	isWaitingForInput,
	isUpdateSuggestionOnly,
	isPromptBoxOnly,
	isPromptBoxBottomBorder,
} from './promptDetector.js';

describe('isPromptBoxOnly', () => {
	it('should return false for empty output', () => {
		expect(isPromptBoxOnly('')).toBe(false);
		expect(isPromptBoxOnly('   ')).toBe(false);
		expect(isPromptBoxOnly('\n\n')).toBe(false);
	});

	it('should return false for output with less than 3 lines', () => {
		expect(isPromptBoxOnly('single line')).toBe(false);
		expect(isPromptBoxOnly('line 1\nline 2')).toBe(false);
	});

	it('should return true for basic prompt box', () => {
		const promptBox = `╭──────────────────────────────────────────────────────────────────────────────╮
│ >                                                                            │
╰──────────────────────────────────────────────────────────────────────────────╯`;
		expect(isPromptBoxOnly(promptBox)).toBe(true);
	});

	it('should return true for prompt box with status text', () => {
		const promptBox = `╭──────────────────────────────────────────────────────────────────────────────╮
│ >                                                                            │
╰──────────────────────────────────────────────────────────────────────────────╯
? for shortcuts`;
		expect(isPromptBoxOnly(promptBox)).toBe(true);
	});

	it('should return true for prompt box with multiple status lines', () => {
		const promptBox = `╭──────────────────────────────────────────────────────────────────────────────╮
│ >                                                                            │
╰──────────────────────────────────────────────────────────────────────────────╯
? for shortcuts
Use /ide for quick edits
◯ Auto-updating disabled
✗ Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code`;
		expect(isPromptBoxOnly(promptBox)).toBe(true);
	});

	it('should return true for prompt box with text inside', () => {
		const promptBox = `╭──────────────────────────────────────────────────────────────────────────────╮
│ > hello world                                                                │
╰──────────────────────────────────────────────────────────────────────────────╯`;
		expect(isPromptBoxOnly(promptBox)).toBe(true);
	});

	it('should return false for missing top border', () => {
		const malformed = `─────────────────────────────────────────────────────
│ >                                                    │
╰──────────────────────────────────────────────────────╯`;
		expect(isPromptBoxOnly(malformed)).toBe(false);
	});

	it('should return false for malformed prompt line', () => {
		const malformed = `╭──────────────────────────────────────────────────────╮
│ No prompt symbol here                                 │
╰──────────────────────────────────────────────────────╯`;
		expect(isPromptBoxOnly(malformed)).toBe(false);
	});

	it('should return false for missing bottom border', () => {
		const malformed = `╭──────────────────────────────────────────────────────╮
│ >                                                     │
─────────────────────────────────────────────────────`;
		expect(isPromptBoxOnly(malformed)).toBe(false);
	});

	it('should return true for prompt box with different border lengths', () => {
		const promptBox = `╭─────╮
│ >   │
╰──────────────────────────────────────╯`;
		expect(isPromptBoxOnly(promptBox)).toBe(true);
	});

	it('should return false when there is non-status content after prompt box', () => {
		const withContent = `╭──────────────────────────────────────────────────────╮
│ >                                                     │
╰──────────────────────────────────────────────────────╯
? for shortcuts
This is some actual content that is not a status line`;
		expect(isPromptBoxOnly(withContent)).toBe(false);
	});

	it('should handle empty lines after prompt box', () => {
		const withEmptyLines = `╭──────────────────────────────────────────────────────╮
│ >                                                     │
╰──────────────────────────────────────────────────────╯

? for shortcuts

`;
		expect(isPromptBoxOnly(withEmptyLines)).toBe(true);
	});

	it('should handle Ctrl-C status message', () => {
		const withCtrlC = `╭──────────────────────────────────────────────────────╮
│ >                                                     │
╰──────────────────────────────────────────────────────╯
Press Ctrl-C again to exit`;
		expect(isPromptBoxOnly(withCtrlC)).toBe(true);
	});

	it('should handle checkmark and cross status symbols', () => {
		const withSymbols = `╭──────────────────────────────────────────────────────╮
│ >                                                     │
╰──────────────────────────────────────────────────────╯
✓ Auto-update complete
✗ Error occurred
◯ Waiting...`;
		expect(isPromptBoxOnly(withSymbols)).toBe(true);
	});
});

describe('isWaitingForInput', () => {
	it('should return false for empty output', () => {
		expect(isWaitingForInput('')).toBe(false);
	});

	it('should return true when output ends with ">"', () => {
		expect(isWaitingForInput('>')).toBe(true);
		expect(isWaitingForInput('Human: test\nAssistant: response\n>')).toBe(true);
		expect(isWaitingForInput('Some output >')).toBe(true);
	});

	it('should return true when output ends with ">" and has trailing whitespace', () => {
		expect(isWaitingForInput('> \n')).toBe(true);
		expect(isWaitingForInput('> \t')).toBe(true);
		expect(isWaitingForInput('Human: test\n> \n\n')).toBe(true);
	});

	it('should return false when ">" is not at the end', () => {
		expect(isWaitingForInput('> some text')).toBe(false);
		expect(isWaitingForInput('test > more text')).toBe(false);
	});

	it('should return true when output contains "│ Do you want"', () => {
		expect(isWaitingForInput('│ Do you want to proceed?')).toBe(true);
		expect(isWaitingForInput('Some output\n│ Do you want to continue?\n')).toBe(
			true,
		);
		expect(isWaitingForInput('│ Do you want')).toBe(true);
	});

	it('should return false when "Do you want" is not preceded by "│"', () => {
		expect(isWaitingForInput('Do you want to proceed?')).toBe(false);
		expect(isWaitingForInput('| Do you want to proceed?')).toBe(false);
	});

	it('should handle complex Claude output scenarios', () => {
		const claudePrompt = `Human: Write a function
Assistant: Here's the function:

\`\`\`javascript
function test() {
  return true;
}
\`\`\`

>`;
		expect(isWaitingForInput(claudePrompt)).toBe(true);
	});

	it('should handle interactive prompts', () => {
		const interactivePrompt = `
┌─────────────────────────────────────────┐
│ Do you want to create a new worktree?   │
└─────────────────────────────────────────┘`;
		expect(isWaitingForInput(interactivePrompt)).toBe(true);
	});
});

describe('isUpdateSuggestionOnly', () => {
	it('should return true for exact auto-update failed message', () => {
		const message =
			'Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code';
		expect(isUpdateSuggestionOnly(message)).toBe(true);
	});

	it('should return true when message has ✗ prefix', () => {
		const message =
			'✗ Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code';
		expect(isUpdateSuggestionOnly(message)).toBe(true);
	});

	it('should return true when message has leading/trailing whitespace', () => {
		const message =
			'  Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code  ';
		expect(isUpdateSuggestionOnly(message)).toBe(true);
	});

	it('should return true when message has ✗ and whitespace', () => {
		const message =
			'  ✗  Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code\n';
		expect(isUpdateSuggestionOnly(message)).toBe(true);
	});

	it('should return false for empty string', () => {
		expect(isUpdateSuggestionOnly('')).toBe(false);
	});

	it('should return false for other error messages', () => {
		expect(isUpdateSuggestionOnly('Error: Command failed')).toBe(false);
		expect(isUpdateSuggestionOnly('✗ Some other error')).toBe(false);
		expect(isUpdateSuggestionOnly('Auto-update succeeded')).toBe(false);
	});

	it('should return false when message is incomplete', () => {
		expect(isUpdateSuggestionOnly('Auto-update failed')).toBe(false);
		expect(isUpdateSuggestionOnly('Try claude doctor')).toBe(false);
	});

	it('should return false when message contains but does not start with the pattern', () => {
		const message =
			'Error occurred: Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code';
		expect(isUpdateSuggestionOnly(message)).toBe(false);
	});
});

describe('isPromptBoxBottomBorder', () => {
	it('should return true for simple bottom border', () => {
		const bottomBorder = '╰──────────────────────────╯';
		expect(isPromptBoxBottomBorder(bottomBorder)).toBe(true);
	});

	it('should return true for bottom border with varying lengths', () => {
		const borders = [
			'╰─╯',
			'╰───╯',
			'╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯',
		];

		borders.forEach(border => {
			expect(isPromptBoxBottomBorder(border)).toBe(true);
		});
	});

	it('should return true for bottom border with whitespace', () => {
		expect(isPromptBoxBottomBorder('  ╰──────────────╯  ')).toBe(true);
		expect(isPromptBoxBottomBorder('\t╰──────────────╯\t')).toBe(true);
		expect(isPromptBoxBottomBorder('╰──────────────╯\n')).toBe(true);
	});

	it('should return false for invalid patterns', () => {
		const invalidPatterns = [
			'╰──────────────────────────',
			'──────────────────────────╯',
			'│──────────────────────────│',
			'Some other text',
			'╰ ─ ─ ─ ╯',
			'╰+++++++╯',
			'',
			'   ',
			'╰╯',
			'╰──────text──────╯',
		];

		invalidPatterns.forEach(pattern => {
			expect(isPromptBoxBottomBorder(pattern)).toBe(false);
		});
	});

	it('should return false for top border pattern', () => {
		expect(isPromptBoxBottomBorder('╭──────────────╮')).toBe(false);
	});

	it('should return false for middle prompt line', () => {
		expect(isPromptBoxBottomBorder('│ >             │')).toBe(false);
	});
});
