export const STATUS_ICONS = {
	BUSY: '●',
	WAITING: '◐',
	IDLE: '○',
} as const;

export const STATUS_LABELS = {
	BUSY: 'Busy',
	WAITING: 'Waiting',
	IDLE: 'Idle',
} as const;

export const MENU_ICONS = {
	NEW_WORKTREE: '⊕',
	EDIT_WORKTREE: '✎',
	MERGE_WORKTREE: '⇄',
	DELETE_WORKTREE: '✕',
	VIEW_MODIFICATIONS: '📊',
	CONFIGURE_SHORTCUTS: '⌨',
	EXIT: '⏻',
} as const;

export const getStatusDisplay = (
	status: 'busy' | 'waiting_input' | 'idle',
): string => {
	switch (status) {
		case 'busy':
			return `${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`;
		case 'waiting_input':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'idle':
			return `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`;
	}
};
