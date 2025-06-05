import {execSync} from 'child_process';
import {existsSync} from 'fs';
import path from 'path';
import {Worktree} from '../types/index.js';

export class WorktreeService {
	private rootPath: string;

	constructor(rootPath?: string) {
		this.rootPath = rootPath || process.cwd();
	}

	getWorktrees(): Worktree[] {
		try {
			const output = execSync('git worktree list --porcelain', {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			const worktrees: Worktree[] = [];
			const lines = output.trim().split('\n');
			
			let currentWorktree: Partial<Worktree> = {};
			
			for (const line of lines) {
				if (line.startsWith('worktree ')) {
					if (currentWorktree.path) {
						worktrees.push(currentWorktree as Worktree);
					}
					currentWorktree = {
						path: line.substring(9),
						isMainWorktree: false,
						hasSession: false,
					};
				} else if (line.startsWith('branch ')) {
					currentWorktree.branch = line.substring(7);
				} else if (line === 'bare') {
					currentWorktree.isMainWorktree = true;
				}
			}
			
			if (currentWorktree.path) {
				worktrees.push(currentWorktree as Worktree);
			}

			// Mark the first worktree as main if none are marked
			if (worktrees.length > 0 && !worktrees.some(w => w.isMainWorktree)) {
				worktrees[0]!.isMainWorktree = true;
			}

			return worktrees;
		} catch (error) {
			// If git worktree command fails, assume we're in a regular git repo
			return [{
				path: this.rootPath,
				branch: this.getCurrentBranch(),
				isMainWorktree: true,
				hasSession: false,
			}];
		}
	}

	private getCurrentBranch(): string {
		try {
			const branch = execSync('git rev-parse --abbrev-ref HEAD', {
				cwd: this.rootPath,
				encoding: 'utf8',
			}).trim();
			return branch;
		} catch {
			return 'unknown';
		}
	}

	isGitRepository(): boolean {
		return existsSync(path.join(this.rootPath, '.git'));
	}
}