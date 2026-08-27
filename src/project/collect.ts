import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { CliCommands } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { copyFileTo, pathExists, removePath } from "../fsutil.js";
import { beefupDir, stagedDir } from "./paths.js";
import { listWritableRelativePaths } from "./workspace.js";

/**
 * Copies writable project files from a staging source into `.beefup/staged`.
 * Uses a temporary directory and renames atomically into place.
 */
export async function collectStagedOutputs(
  sourceRoot: string,
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  const dest = stagedDir(projectRoot);
  const tmp = path.join(beefupDir(projectRoot), "staged.tmp");
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
 * Ensures `.beefup/staged` contains a proposal lockfile for the project.
 * Returns the staged directory path.
 */
export async function requireStagedUpgrade(
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  const staged = stagedDir(projectRoot);
  const stagedLock = path.join(staged, lockfileName);
  if (!(await pathExists(stagedLock))) {
    throw new BeefupError(
      `no staged lockfile at ${path.relative(projectRoot, stagedLock) || stagedLock}; run beefup ${CliCommands.Stage} first`
    );
  }
  return staged;
}

/**
 * Copies staged proposal files from `.beefup/staged` into the live project tree.
 * Returns the relative paths that were written.
 */
export async function applyStagedOutputs(
  projectRoot: string,
  lockfileName: string
): Promise<string[]> {
  const staged = stagedDir(projectRoot);
  const rels = await listWritableRelativePaths(staged, lockfileName);
  const copied: string[] = [];
  for (const rel of rels) {
    const from = path.join(staged, rel);
    if (!(await pathExists(from))) {
      continue;
    }
    await copyFileTo(from, path.join(projectRoot, rel));
    copied.push(rel);
  }
  return copied;
}
