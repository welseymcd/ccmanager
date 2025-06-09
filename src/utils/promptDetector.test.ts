import {describe, it, expect} from 'vitest';
import {includesPromptBoxBottomBorder} from './promptDetector.js';

describe('includesPromptBoxBottomBorder', () => {
	it('should return false for empty output', () => {
		expect(includesPromptBoxBottomBorder('')).toBe(false);
		expect(includesPromptBoxBottomBorder('   ')).toBe(false);
		expect(includesPromptBoxBottomBorder('\n\n')).toBe(false);
	});

	it('should accept lines ending with ╯', () => {
		// Basic pattern
		expect(includesPromptBoxBottomBorder('──╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('────────╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('─╯')).toBe(true);
	});

	it('should accept complete bottom border (╰───╯)', () => {
		expect(includesPromptBoxBottomBorder('╰───╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('╰─────────────╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('╰─╯')).toBe(true);
	});

	it('should accept when part of multi-line output', () => {
		const output1 = `Some text
──╯
More text`;
		expect(includesPromptBoxBottomBorder(output1)).toBe(true);

		const output2 = `First line
╰─────────────╯
Last line`;
		expect(includesPromptBoxBottomBorder(output2)).toBe(true);
	});

	it('should accept with leading/trailing whitespace', () => {
		expect(includesPromptBoxBottomBorder('  ──╯  ')).toBe(true);
		expect(includesPromptBoxBottomBorder('\t╰───╯\t')).toBe(true);
		expect(includesPromptBoxBottomBorder('\n──╯\n')).toBe(true);
	});

	it('should reject when ╯ is followed by │', () => {
		expect(includesPromptBoxBottomBorder('──╯ │')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰───╯ │')).toBe(false);
		expect(includesPromptBoxBottomBorder('──╯ │ more text')).toBe(false);
	});

	it('should reject when line starts with ╰ but does not end with ╯', () => {
		expect(includesPromptBoxBottomBorder('╰───')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰─────────')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰─── some text')).toBe(false);
	});

	it('should reject lines that do not match the pattern', () => {
		// Missing ─ characters
		expect(includesPromptBoxBottomBorder('╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰╯')).toBe(false);

		// Wrong characters
		expect(includesPromptBoxBottomBorder('===╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰===╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('---╯')).toBe(false);

		// Top border pattern
		expect(includesPromptBoxBottomBorder('╭───╮')).toBe(false);

		// Middle line pattern
		expect(includesPromptBoxBottomBorder('│ > │')).toBe(false);

		// Random text
		expect(includesPromptBoxBottomBorder('Some random text')).toBe(false);
		expect(includesPromptBoxBottomBorder('Exit code: 0')).toBe(false);
	});

	it('should handle complex multi-line scenarios correctly', () => {
		const validOutput = `
╭────────────────────╮
│ > hello            │
╰────────────────────╯
Some status text`;
		expect(includesPromptBoxBottomBorder(validOutput)).toBe(true);

		const invalidOutput = `
╭────────────────────╮
│ > hello            │
╰──────────────────── 
Some other text`;
		expect(includesPromptBoxBottomBorder(invalidOutput)).toBe(false);
	});

	it('should handle partial border at end of line', () => {
		const partialBorder = `Some output text ──╯`;
		expect(includesPromptBoxBottomBorder(partialBorder)).toBe(true);

		const partialInvalid = `Some output text ──╯ │`;
		expect(includesPromptBoxBottomBorder(partialInvalid)).toBe(false);
	});
});
