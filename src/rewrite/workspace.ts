import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { UpgradeMode } from "../config/types.js";
import { pathExists, readJsonFile, writeJsonFile } from "../fsutil.js";
import { lockedVersionsForRepin } from "../lockfile/locked.js";
import type { PackageJson } from "../project/package-json.js";
import type { PackageManager } from "../project/types.js";
import { listWorkspacePackages } from "../project/workspace.js";
import { rewritePackageJson } from "./constraints.js";
import {
  rePinOverrideMap,
  rePinPackageJsonOverrides,
  rewriteOverrideMap,
  rewritePackageJsonOverrides,
} from "./overrides.js";
import { rePinPackageJson } from "./repin.js";

/** Options for rewrite/re-pin passes over a workspace. */
export interface WorkspaceRewriteOptions {
  /** When true, leave override pins unchanged. */
  preserveOverrides?: boolean;
}

/**
 * Rewrites `overrides` in `pnpm-workspace.yaml` when present.
 */
async function rewriteWorkspaceYamlOverrides(
  root: string,
  mode: UpgradeMode
): Promise<void> {
  const workspacePath = path.join(root, "pnpm-workspace.yaml");
  if (!(await pathExists(workspacePath))) {
    return;
  }
  const parsed = parseYaml(await readFile(workspacePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  const doc = parsed as Record<string, unknown>;
  if (!doc.overrides || typeof doc.overrides !== "object" || Array.isArray(doc.overrides)) {
    return;
  }
  doc.overrides = rewriteOverrideMap(doc.overrides as Record<string, unknown>, mode);
  await writeFile(workspacePath, stringifyYaml(doc), "utf8");
}

/**
 * Re-pins `overrides` in `pnpm-workspace.yaml` when present.
 */
async function rePinWorkspaceYamlOverrides(
  root: string,
  locked: Map<string, string>
): Promise<void> {
  const workspacePath = path.join(root, "pnpm-workspace.yaml");
  if (!(await pathExists(workspacePath))) {
    return;
  }
  const parsed = parseYaml(await readFile(workspacePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  const doc = parsed as Record<string, unknown>;
  if (!doc.overrides || typeof doc.overrides !== "object" || Array.isArray(doc.overrides)) {
    return;
  }
  doc.overrides = rePinOverrideMap(doc.overrides as Record<string, unknown>, locked);
  await writeFile(workspacePath, stringifyYaml(doc), "utf8");
}

/**
 * Rewrites dependency ranges in every workspace package.json according to upgrade mode.
 * Unless `preserveOverrides` is set, also rewrites override pins the same way.
 */
export async function rewriteWorkspace(
  root: string,
  mode: UpgradeMode,
  options: WorkspaceRewriteOptions = {}
): Promise<void> {
  const workspaces = await listWorkspacePackages(root);
  for (const ws of workspaces) {
    const pkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    let next = rewritePackageJson(pkg, mode);
    if (!options.preserveOverrides) {
      next = rewritePackageJsonOverrides(next, mode);
    }
    await writeJsonFile(ws.packageJsonPath, next);
  }
  if (!options.preserveOverrides) {
    await rewriteWorkspaceYamlOverrides(root, mode);
  }
}

/**
 * Re-pins every workspace package.json to exact versions from the given lockfile.
 * npm workspaces resolve hoisted root installs and workspace links.
 * pnpm reads each importer's own locked versions (hoisting is not used).
 * Unless `preserveOverrides` is set, also re-pins override targets.
 */
export async function repinWorkspace(
  root: string,
  lockfilePath: string,
  packageManager: PackageManager,
  options: WorkspaceRewriteOptions = {}
): Promise<void> {
  const workspaces = await listWorkspacePackages(root);
  let rootLocked: Map<string, string> | undefined;
  for (const ws of workspaces) {
    const locked = await lockedVersionsForRepin({
      lockfilePath,
      packageManager,
      importerDir: ws.relativeDir,
    });
    if (ws.relativeDir === ".") {
      rootLocked = locked;
    }
    const pkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    let next = rePinPackageJson(pkg, locked);
    if (!options.preserveOverrides) {
      next = rePinPackageJsonOverrides(next, locked);
    }
    await writeJsonFile(ws.packageJsonPath, next);
  }
  if (!options.preserveOverrides) {
    const locked =
      rootLocked ??
      (await lockedVersionsForRepin({
        lockfilePath,
        packageManager,
        importerDir: ".",
      }));
    await rePinWorkspaceYamlOverrides(root, locked);
  }
}

/**
 * Joins a project root with its lockfile basename.
 */
export function lockfilePathFor(root: string, lockfileName: string): string {
  return path.join(root, lockfileName);
}
