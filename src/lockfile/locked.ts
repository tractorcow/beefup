import { readFile } from "node:fs/promises";

import { PackageManagers, type PackageManager } from "../project/types.js";
import { lockedVersionsFromNpm, parseNpmLockfile } from "./npm.js";
import { lockedVersionsFromPnpm, parsePnpmLockfile } from "./pnpm.js";

/**
 * Reads a lockfile and returns direct dependency versions for one workspace importer.
 */
export async function lockedVersionsForImporter(options: {
  lockfilePath: string;
  packageManager: PackageManager;
  importerDir: string;
}): Promise<Map<string, string>> {
  const content = await readFile(options.lockfilePath, "utf8");
  if (options.packageManager === PackageManagers.Npm) {
    return lockedVersionsFromNpm(parseNpmLockfile(content), options.importerDir);
  }
  return lockedVersionsFromPnpm(parsePnpmLockfile(content), options.importerDir);
}
