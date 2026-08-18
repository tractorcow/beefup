import { mkdir } from "node:fs/promises";

import { BeefupError } from "../errors.js";
import { pathExists, removePath } from "../fsutil.js";
import { worktreeDir, beefupDir } from "../project/paths.js";
import { isGitRepo, runGit } from "./git.js";
import type { StageStrategy, StageWorkspace } from "./types.js";

export class WorktreeStrategy implements StageStrategy {
  readonly name = "worktree" as const;
  private workRoot: string | undefined;

  constructor(private readonly projectRoot: string) {}

  async prepare(): Promise<StageWorkspace> {
    if (!(await isGitRepo(this.projectRoot))) {
      throw new BeefupError(
        "strategy worktree requires a git repository; commit the project or use --strategy inplace"
      );
    }

    const { stdout: status } = await runGit(
      ["status", "--porcelain"],
      this.projectRoot
    );
    if (status.length > 0) {
      throw new BeefupError(
        "strategy worktree requires a clean working tree (no staged, unstaged, or untracked files); commit or stash changes, or use --strategy inplace"
      );
    }

    const workRoot = worktreeDir(this.projectRoot);
    await this.removeLeftoverWorktree(workRoot);
    await mkdir(beefupDir(this.projectRoot), { recursive: true });
    await runGit(
      ["worktree", "add", "--detach", workRoot, "HEAD"],
      this.projectRoot
    );
    this.workRoot = workRoot;
    return { root: workRoot };
  }

  async cleanup(): Promise<void> {
    if (!this.workRoot) {
      const leftover = worktreeDir(this.projectRoot);
      if (await pathExists(leftover)) {
        await this.removeLeftoverWorktree(leftover);
      }
      return;
    }
    await this.removeLeftoverWorktree(this.workRoot);
    this.workRoot = undefined;
  }

  private async removeLeftoverWorktree(workRoot: string): Promise<void> {
    if (!(await pathExists(workRoot))) {
      return;
    }
    try {
      await runGit(
        ["worktree", "remove", "--force", workRoot],
        this.projectRoot
      );
    } catch {
      await removePath(workRoot);
      try {
        await runGit(["worktree", "prune"], this.projectRoot);
      } catch {
        // Ignore prune failures after a forced directory removal.
      }
    }
  }
}
