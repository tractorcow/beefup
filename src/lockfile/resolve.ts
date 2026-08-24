import { readFile } from "node:fs/promises";

import { PackageManagers, type PackageManager } from "../project/types.js";
import { resolveNpmLockfile } from "./npm.js";
import { resolvePnpmLockfile } from "./pnpm.js";
import type { Resolution } from "./types.js";

/**
 * Resolves direct dependency versions from an npm or pnpm lockfile.
 */
export async function resolveLockfile(
  lockfilePath: string,
  packageManager: PackageManager
): Promise<Resolution> {
  if (packageManager === PackageManagers.Npm) {
    return resolveNpmLockfile(lockfilePath);
  }
  return resolvePnpmLockfile(lockfilePath);
}

/**
 * Reads a UTF-8 text file from disk.
 */
export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
