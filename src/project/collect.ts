import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
 * Copies writable project files from a staging source into `.beefup/staged`.
 */
export async function collectStagedOutputs(
  sourceRoot: string,
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  return snapshotWritableFiles(
    sourceRoot,
    stagedDir(projectRoot),
    lockfileName
  );
}

/**
 * Copies writable project files from a live tree into `.beefup/prior`.
 */
export async function collectPriorOutputs(
  sourceRoot: string,
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  return snapshotWritableFiles(
    sourceRoot,
    priorDir(projectRoot),
    lockfileName
  );
}

/**
 * Returns true when both files exist and have identical bytes.
 */
export async function filesByteEqual(
  left: string,
  right: string
): Promise<boolean> {
  if (!(await pathExists(left)) || !(await pathExists(right))) {
    return false;
  }
  const [a, b] = await Promise.all([readFile(left), readFile(right)]);
  return a.equals(b);
}

/**
 * Ensures a snapshot directory contains a lockfile. Returns the snapshot root.
 */
export async function requireSnapshotLockfile(
  projectRoot: string,
  snapshotRoot: string,
  lockfileName: string,
  hint: string
): Promise<string> {
  const lockPath = path.join(snapshotRoot, lockfileName);
  if (!(await pathExists(lockPath))) {
    throw new BeefupError(
      `no lockfile at ${path.relative(projectRoot, lockPath) || lockPath}; ${hint}`
    );
  }
  return snapshotRoot;
}

/**
 * Ensures `.beefup/staged` contains a proposal lockfile for the project.
 * Returns the staged directory path.
 */
export async function requireStagedUpgrade(
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  return requireSnapshotLockfile(
    projectRoot,
    stagedDir(projectRoot),
    lockfileName,
    `run beefup ${CliCommands.Stage} first`
  );
}

/**
 * Ensures `.beefup/prior` contains a baseline lockfile for the project.
 * Returns the prior directory path.
 */
export async function requirePriorUpgrade(
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  return requireSnapshotLockfile(
    projectRoot,
    priorDir(projectRoot),
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
 * Copies staged proposal files from `.beefup/staged` into the live package tree.
 */
export async function applyStagedOutputs(
  projectRoot: string,
  liveRoot: string,
  lockfileName: string
): Promise<string[]> {
  return applySnapshotToLive(
    stagedDir(projectRoot),
    liveRoot,
    lockfileName
  );
}

/**
 * Copies prior snapshot files from `.beefup/prior` into the live package tree.
 */
export async function applyPriorOutputs(
  projectRoot: string,
  liveRoot: string,
  lockfileName: string
): Promise<string[]> {
  return applySnapshotToLive(
    priorDir(projectRoot),
    liveRoot,
    lockfileName
  );
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
