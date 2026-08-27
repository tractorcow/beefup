import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { AlignmentActions, type BeefupConfig } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import { parseNpmLockfile } from "../lockfile/npm.js";
import { parsePnpmLockfile } from "../lockfile/pnpm.js";
import type { NpmLockfile, PnpmLockfile } from "../lockfile/types.js";
import type { PackageJson } from "../project/package-json.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import { listWorkspacePackages } from "../project/workspace.js";
import { findAlignmentIssues, type AlignmentFinding } from "./alignment.js";
import {
  findStaleOverridePins,
  findWorkspaceOverrideDrift,
  normalizeLockForOverrides,
  type OverrideFinding,
} from "./overrides.js";
import { findRangeIssues, type RangeFinding } from "./ranges.js";

export interface PolicyResult {
  ranges: RangeFinding[];
  overrides: OverrideFinding[];
  alignment: AlignmentFinding[];
  warnings: string[];
}

/**
 * Evaluates range, override, and alignment policy against a project workspace.
 */
export async function evaluatePolicy(
  root: string,
  packageManager: PackageManager,
  lockfileName: string,
  config: BeefupConfig
): Promise<PolicyResult> {
  const pkg = await readJsonFile<PackageJson>(path.join(root, "package.json"));
  const lockPath = path.join(root, lockfileName);
  const lockContent = await readFile(lockPath, "utf8");
  const lock: NpmLockfile | PnpmLockfile =
    packageManager === PackageManagers.Npm
      ? parseNpmLockfile(lockContent)
      : parsePnpmLockfile(lockContent);

  let workspaceOverrides: Record<string, unknown> | undefined;
  const workspacePath = path.join(root, "pnpm-workspace.yaml");
  if (await pathExists(workspacePath)) {
    const parsed = parseYaml(await readFile(workspacePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const overrides = (parsed as Record<string, unknown>).overrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        workspaceOverrides = overrides as Record<string, unknown>;
      }
    }
  }

  const ranges: RangeFinding[] = [];
  const workspaces = await listWorkspacePackages(root);
  for (const ws of workspaces) {
    const wsPkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    const label = ws.relativeDir === "." ? "package.json" : `${ws.relativeDir}/package.json`;
    ranges.push(...findRangeIssues(wsPkg, config, label));
  }

  const normalized = normalizeLockForOverrides(packageManager, lock);
  const overrides = [
    ...findStaleOverridePins(pkg, normalized),
    ...findWorkspaceOverrideDrift(pkg, workspaceOverrides),
  ];
  const alignment = findAlignmentIssues(
    config,
    pkg,
    packageManager,
    lock,
    workspaceOverrides
  );

  const warnings = [
    ...ranges
      .filter((item) => item.severity === AlignmentActions.Warn)
      .map((item) => item.message),
    ...alignment
      .filter((item) => item.severity === AlignmentActions.Warn)
      .map((item) => `[${item.group}] ${item.message}`),
  ];

  return { ranges, overrides, alignment, warnings };
}

/**
 * Throws when the policy result contains any error-severity findings.
 */
export function assertPolicy(result: PolicyResult): void {
  const errors = [
    ...result.ranges
      .filter((item) => item.severity === AlignmentActions.Error)
      .map((item) => item.message),
    ...result.overrides.map((item) => `[${item.override}] ${item.message}`),
    ...result.alignment
      .filter((item) => item.severity === AlignmentActions.Error)
      .map((item) => `[${item.group}] ${item.message}`),
  ];
  if (errors.length > 0) {
    throw new BeefupError(`policy failed:\n${errors.map((line) => `  - ${line}`).join("\n")}`);
  }
}
