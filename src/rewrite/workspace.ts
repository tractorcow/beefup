import path from "node:path";

import type { UpgradeMode } from "../config/types.js";
import { readJsonFile, writeJsonFile } from "../fsutil.js";
import { lockedVersionsForImporter } from "../lockfile/locked.js";
import type { PackageJson } from "../project/package-json.js";
import type { PackageManager } from "../project/types.js";
import { listWorkspacePackages } from "../project/workspace.js";
import { rewritePackageJson } from "./constraints.js";
import { rePinPackageJson } from "./repin.js";

/**
 * Rewrites dependency ranges in every workspace package.json according to upgrade mode.
 */
export async function rewriteWorkspace(
  root: string,
  mode: UpgradeMode
): Promise<void> {
  const workspaces = await listWorkspacePackages(root);
  for (const ws of workspaces) {
    const pkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    const next = rewritePackageJson(pkg, mode);
    await writeJsonFile(ws.packageJsonPath, next);
  }
}

/**
 * Re-pins every workspace package.json to exact versions from the given lockfile.
 */
export async function repinWorkspace(
  root: string,
  lockfilePath: string,
  packageManager: PackageManager
): Promise<void> {
  const workspaces = await listWorkspacePackages(root);
  for (const ws of workspaces) {
    const locked = await lockedVersionsForImporter({
      lockfilePath,
      packageManager,
      importerDir: ws.relativeDir,
    });
    const pkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    const next = rePinPackageJson(pkg, locked);
    await writeJsonFile(ws.packageJsonPath, next);
  }
}

/**
 * Joins a project root with its lockfile basename.
 */
export function lockfilePathFor(root: string, lockfileName: string): string {
  return path.join(root, lockfileName);
}
