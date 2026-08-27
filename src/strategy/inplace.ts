import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { StageStrategies } from "../config/types.js";
import { copyFileTo, pathExists, removePath } from "../fsutil.js";
import { backupDir, inProgressPath } from "../project/paths.js";
import { listWritableRelativePaths } from "../project/workspace.js";
import type { StageStrategy, StageWorkspace } from "./types.js";

/**
 * Stages upgrades in the live project tree using a backup for rollback.
 */
export class InPlaceStrategy implements StageStrategy {
  readonly name = StageStrategies.Inplace;
  private backedUp = false;

  /**
   * Creates an in-place strategy for the given project root and lockfile name.
   */
  constructor(
    private readonly projectRoot: string,
    private readonly lockfileName: string
  ) {}

  /**
   * Backs up writable project files and marks staging as in progress.
   */
  async prepare(): Promise<StageWorkspace> {
    if (await pathExists(inProgressPath(this.projectRoot))) {
      await this.restoreFromBackup();
    }
    await this.backup();
    await writeFile(
      inProgressPath(this.projectRoot),
      `${StageStrategies.Inplace}\n`,
      "utf8"
    );
    this.backedUp = true;
    return { root: this.projectRoot };
  }

  /**
   * Restores the live tree from backup when an in-place stage was started.
   */
  async cleanup(): Promise<void> {
    if (this.backedUp || (await pathExists(inProgressPath(this.projectRoot)))) {
      await this.restoreFromBackup();
    }
    this.backedUp = false;
  }

  /**
   * Copies writable project files into the backup directory before mutation.
   */
  private async backup(): Promise<void> {
    const dest = backupDir(this.projectRoot);
    await removePath(dest);
    await mkdir(dest, { recursive: true });
    const rels = await listWritableRelativePaths(
      this.projectRoot,
      this.lockfileName
    );
    for (const rel of rels) {
      const from = path.join(this.projectRoot, rel);
      if (await pathExists(from)) {
        await copyFileTo(from, path.join(dest, rel));
      }
    }
  }

  /**
   * Restores writable files from backup and clears the in-progress marker.
   */
  private async restoreFromBackup(): Promise<void> {
    const dest = backupDir(this.projectRoot);
    if (!(await pathExists(dest))) {
      await removePath(inProgressPath(this.projectRoot));
      return;
    }
    const rels = await listWritableRelativePaths(
      this.projectRoot,
      this.lockfileName
    );
    for (const rel of rels) {
      const from = path.join(dest, rel);
      if (await pathExists(from)) {
        await copyFileTo(from, path.join(this.projectRoot, rel));
      }
    }
    await removePath(inProgressPath(this.projectRoot));
  }
}
