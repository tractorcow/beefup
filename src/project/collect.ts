import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliCommands } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { copyFileTo, pathExists, removePath } from "../fsutil.js";
import { priorDir, stagedDir } from "./paths.js";
import { listWritableRelativePaths } from "./workspace.js";

/**
 * Copies writable project files from `sourceRoot` into `dest` atomically.
 * Uses a sibling `.tmp` directory and renames into place.
 */
export async function snapshotWritableFiles(
  sourceRoot: string,
  dest: string,
  lockfileName: string
): Promise<string> {
  const tmp = `${dest}.tmp`;
  await removePath(tmp);
  await mkdir(tmp, { recursive: true });

  const rels = await listWritableRelativePaths(sourceRoot, lockfileName);
  for (const rel of rels) {
    const from = path.join(sourceRoot, rel);
    if (!(await pathExists(from))) {
      continue;
    }
    await copyFileTo(from, path.join(tmp, rel));
  }

  await removePath(dest);
  await mkdir(path.dirname(dest), { recursive: true });
  await rename(tmp, dest);
  return dest;
}

/**
 * Copies writable project files from a staging source into the package `.beefup/staged`.
 */
export async function collectStagedOutputs(
  sourceRoot: string,
  packageRoot: string,
  lockfileName: string
): Promise<string> {
  return snapshotWritableFiles(
    sourceRoot,
    stagedDir(packageRoot),
    lockfileName
  );
}

/**
 * Copies writable project files from a live tree into the package `.beefup/prior`.
 */
export async function collectPriorOutputs(
  sourceRoot: string,
  packageRoot: string,
  lockfileName: string
): Promise<string> {
  return snapshotWritableFiles(
    sourceRoot,
    priorDir(packageRoot),
    lockfileName
  );
}

/**
 * Ensures a snapshot directory contains a lockfile. Returns the snapshot root.
 */
export async function requireSnapshotLockfile(
  packageRoot: string,
  snapshotRoot: string,
  lockfileName: string,
  hint: string
): Promise<string> {
  const lockPath = path.join(snapshotRoot, lockfileName);
  if (!(await pathExists(lockPath))) {
    throw new BeefupError(
      `no lockfile at ${path.relative(packageRoot, lockPath) || lockPath}; ${hint}`
    );
  }
  return snapshotRoot;
}

/**
 * Ensures the package `.beefup/staged` contains a proposal lockfile.
 * Returns the staged directory path.
 */
export async function requireStagedUpgrade(
  packageRoot: string,
  lockfileName: string
): Promise<string> {
  return requireSnapshotLockfile(
    packageRoot,
    stagedDir(packageRoot),
    lockfileName,
    `run beefup ${CliCommands.Stage} first`
  );
}

/**
 * Ensures the package `.beefup/prior` contains a baseline lockfile.
 * Returns the prior directory path.
 */
export async function requirePriorUpgrade(
  packageRoot: string,
  lockfileName: string
): Promise<string> {
  return requireSnapshotLockfile(
    packageRoot,
    priorDir(packageRoot),
    lockfileName,
    `run beefup ${CliCommands.Accept} or beefup ${CliCommands.Rewind} first`
  );
}

/**
 * Copies writable snapshot files from `snapshotRoot` into the live package tree.
 * Returns the relative paths that were written.
 */
export async function applySnapshotToLive(
  snapshotRoot: string,
  liveRoot: string,
  lockfileName: string
): Promise<string[]> {
  const rels = await listWritableRelativePaths(snapshotRoot, lockfileName);
  const copied: string[] = [];
  for (const rel of rels) {
    const from = path.join(snapshotRoot, rel);
    if (!(await pathExists(from))) {
      continue;
    }
    await copyFileTo(from, path.join(liveRoot, rel));
    copied.push(rel);
  }
  return copied;
}

/**
 * Copies staged proposal files from the package `.beefup/staged` into the live package tree.
 */
export async function applyStagedOutputs(
  packageRoot: string,
  liveRoot: string,
  lockfileName: string
): Promise<string[]> {
  return applySnapshotToLive(
    stagedDir(packageRoot),
    liveRoot,
    lockfileName
  );
}

/**
 * Copies prior snapshot files from the package `.beefup/prior` into the live package tree.
 */
export async function applyPriorOutputs(
  packageRoot: string,
  liveRoot: string,
  lockfileName: string
): Promise<string[]> {
  return applySnapshotToLive(
    priorDir(packageRoot),
    liveRoot,
    lockfileName
  );
}

/**
 * Removes the package `.beefup/staged` if it exists.
 */
export async function removeStagedOutputs(packageRoot: string): Promise<void> {
  await removePath(stagedDir(packageRoot));
}

/**
 * Removes the package `.beefup/prior` if it exists.
 */
export async function removePriorOutputs(packageRoot: string): Promise<void> {
  await removePath(priorDir(packageRoot));
}

/**
 * Writes UTF-8 contents to a path, creating parent directories as needed.
 */
export async function writeTextFile(
  dest: string,
  contents: string
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, contents, "utf8");
}
