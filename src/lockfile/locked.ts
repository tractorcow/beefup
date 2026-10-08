import { readFile } from "node:fs/promises";

import { PackageManagers, type PackageManager } from "../project/types.js";
import { lockedVersionsFromNpm, parseNpmLockfile, resolveNpmLockfile } from "./npm.js";
import {
  lockedVersionsFromPnpm,
  parsePnpmLockfile,
  resolvePnpmLockfile,
} from "./pnpm.js";
import type { Resolution } from "./types.js";

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

/**
 * Fills missing package names from a full lockfile resolution without replacing
 * importer-scoped versions already present in `locked`.
 */
function mergeResolutionVersions(
  locked: Map<string, string>,
  resolution: Resolution
): void {
  for (const pkg of [...resolution.dependencies, ...resolution.devDependencies]) {
    if (!locked.has(pkg.name)) {
      locked.set(pkg.name, pkg.version);
    }
  }
}

/**
 * Reads locked versions for an importer and adds transitive packages from the
 * full lockfile so override targets can be re-pinned.
 */
export async function lockedVersionsForRepin(options: {
  lockfilePath: string;
  packageManager: PackageManager;
  importerDir: string;
}): Promise<Map<string, string>> {
  const locked = await lockedVersionsForImporter(options);
  const resolution =
    options.packageManager === PackageManagers.Npm
      ? await resolveNpmLockfile(options.lockfilePath)
      : await resolvePnpmLockfile(options.lockfilePath);
  mergeResolutionVersions(locked, resolution);
  return locked;
}
