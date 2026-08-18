import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { copyFileTo, pathExists, removePath } from "../fsutil.js";
import { backupDir, inProgressPath } from "../project/paths.js";
import { listWritableRelativePaths } from "../project/workspace.js";
import type { StageStrategy, StageWorkspace } from "./types.js";

export class InPlaceStrategy implements StageStrategy {
  readonly name = "inplace" as const;
  private backedUp = false;

  constructor(
    private readonly projectRoot: string,
    private readonly lockfileName: string
  ) {}

  async prepare(): Promise<StageWorkspace> {
    if (await pathExists(inProgressPath(this.projectRoot))) {
      await this.restoreFromBackup();
    }
    await this.backup();
    await writeFile(inProgressPath(this.projectRoot), "inplace\n", "utf8");
    this.backedUp = true;
    return { root: this.projectRoot };
  }

  async cleanup(): Promise<void> {
    if (this.backedUp || (await pathExists(inProgressPath(this.projectRoot)))) {
      await this.restoreFromBackup();
    }
    this.backedUp = false;
  }

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
