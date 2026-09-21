import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DefaultPackageRoot, StageStrategies } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, removePath } from "../fsutil.js";
import { beefupDir, worktreeDir } from "../project/paths.js";
import {
  GitFlags,
  GitRefs,
  GitSubcommands,
  GitWorktreeActions,
  hasNonBeefupWorkingTreeChanges,
  isGitRepo,
  runGit,
} from "./git.js";
import type { StageStrategy, StageWorkspace } from "./types.js";

/**
 * Stages upgrades in a detached git worktree so the live tree stays untouched.
 */
export class WorktreeStrategy implements StageStrategy {
  readonly name = StageStrategies.Worktree;
  private workRoot: string | undefined;

  /**
   * Creates a worktree strategy for the git root and optional nested package dir.
   */
  constructor(
    private readonly gitRoot: string,
    private readonly packageRelative: string = DefaultPackageRoot
  ) {}

  /**
   * Absolute package directory that owns `.beefup` for this stage.
   */
  private packageAbsolute(): string {
    return this.packageRelative === DefaultPackageRoot
      ? this.gitRoot
      : path.join(this.gitRoot, this.packageRelative);
  }

  /**
   * Requires a git repo whose package subtree is clean except for `.beefup/`,
   * then creates a detached worktree under the package `.beefup`.
   */
  async prepare(): Promise<StageWorkspace> {
    if (!(await isGitRepo(this.gitRoot))) {
      throw new BeefupError(
        `strategy ${StageStrategies.Worktree} requires a git repository; commit the project or use --strategy ${StageStrategies.Inplace}`
      );
    }

    const { stdout: status } = await runGit(
      [GitSubcommands.Status, GitFlags.Porcelain],
      this.gitRoot
    );
    if (hasNonBeefupWorkingTreeChanges(status, this.packageRelative)) {
      throw new BeefupError(
        `strategy ${StageStrategies.Worktree} requires a clean working tree (no staged, unstaged, or untracked files); commit or stash changes, or use --strategy ${StageStrategies.Inplace}`
      );
    }

    const packageAbs = this.packageAbsolute();
    const workRoot = worktreeDir(packageAbs);
    await this.removeLeftoverWorktree(workRoot);
    await mkdir(beefupDir(packageAbs), { recursive: true });
    await runGit(
      [
        GitSubcommands.Worktree,
        GitWorktreeActions.Add,
        GitFlags.Detach,
        workRoot,
        GitRefs.Head,
      ],
      this.gitRoot
    );
    this.workRoot = workRoot;
    const packageRoot =
      this.packageRelative === DefaultPackageRoot
        ? workRoot
        : path.join(workRoot, this.packageRelative);
    return { root: packageRoot };
  }

  /**
   * Removes the staging worktree created by prepare, including leftovers.
   */
  async cleanup(): Promise<void> {
    if (!this.workRoot) {
      const leftover = worktreeDir(this.packageAbsolute());
      if (await pathExists(leftover)) {
        await this.removeLeftoverWorktree(leftover);
      }
      return;
    }
    await this.removeLeftoverWorktree(this.workRoot);
    this.workRoot = undefined;
  }

  /**
   * Force-removes a worktree path via git, falling back to deleting the directory.
   */
  private async removeLeftoverWorktree(workRoot: string): Promise<void> {
    if (!(await pathExists(workRoot))) {
      return;
    }
    try {
      await runGit(
        [
          GitSubcommands.Worktree,
          GitWorktreeActions.Remove,
          GitFlags.Force,
          workRoot,
        ],
        this.gitRoot
      );
    } catch {
      await removePath(workRoot);
      try {
        await runGit(
          [GitSubcommands.Worktree, GitWorktreeActions.Prune],
          this.gitRoot
        );
      } catch {
        // Ignore prune failures after a forced directory removal.
      }
    }
  }
}
