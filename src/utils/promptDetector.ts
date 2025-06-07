export function isPromptBoxOnly(output: string): boolean {
	// Trim the output to remove leading/trailing whitespace
	const trimmed = output.trim();

	// If empty, it's not a prompt box
	if (!trimmed) {
		return false;
	}

	// Split into lines
	const lines = trimmed.split('\n');

	// Need at least 3 lines for a prompt box (top border, prompt line, bottom border)
	if (lines.length < 3) {
		return false;
	}

	// Check if the first three lines form a prompt box
	const hasTopBorder = /^╭─+╮$/.test(lines[0] || '');
	const hasPromptLine = /^│\s*>\s*.*│$/.test(lines[1] || '');
	const hasBottomBorder = /^╰─+╯$/.test(lines[2] || '');

	if (!hasTopBorder || !hasPromptLine || !hasBottomBorder) {
		return false;
	}

	// Check remaining lines - they should only be status text
	for (let i = 3; i < lines.length; i++) {
		const line = lines[i]?.trim() || '';

		// Skip empty lines
		if (!line) {
			continue;
		}

		// Check if it's a known status line pattern
		const isStatusLine =
			line.includes('? for shortcuts') ||
			line.includes('Use /ide') ||
			line.includes('Auto-update') ||
			line.includes('Auto-updating') ||
			line.includes('claude doctor') ||
			line.includes('Press Ctrl-C again to exit') ||
			line.startsWith('◯') ||
			line.startsWith('✗') ||
			line.startsWith('✓');

		if (!isStatusLine) {
			return false;
		}
	}

	return true;
}

export function isWaitingForInput(output: string): boolean {
	// Don't trim - we need to check end patterns
	if (!output) {
		return false;
	}

	// Check if output ends with Claude prompt ("> " at the end)
	if (output.trimEnd().endsWith('>')) {
		return true;
	}

	// Check for user interaction
	// `│ Do you want to proceed?`
	if (output.includes('│ Do you want')) {
		return true;
	}

	return false;
}

export function isUpdateSuggestionOnly(output: string): boolean {
	if (
		output
			.replace('✗', '')
			.trim()
			.startsWith(
				'Auto-update failed · Try claude doctor or npm i -g @anthropic-ai/claude-code',
			)
	) {
		return true;
	}

	return false;
}
