import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import type { PackageJson } from "../project/package-json.js";
import {
  BeefupConfigFileName,
  DEFAULT_CONFIG,
  isAlignmentAction,
  isUpgradeMode,
  type BeefupConfig,
  type UpgradeMode,
} from "./types.js";

/**
 * Returns a string array when `value` is an array of strings; otherwise undefined.
 */
function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.every((item): item is string => typeof item === "string")) {
    return value;
  }
  return undefined;
}

/**
 * Parses `packageRoot` from config as a string or string array.
 */
function parsePackageRoot(
  value: unknown
): string | string[] | undefined {
  if (typeof value === "string") {
    return value;
  }
  return asStringArray(value);
}

/**
 * Extracts known Beefup config fields from a raw object, ignoring unknown shapes.
 */
function parsePartial(raw: unknown): Partial<BeefupConfig> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const partial: Partial<BeefupConfig> = {};

  if (isUpgradeMode(input.mode)) {
    partial.mode = input.mode;
  }
  const banned = asStringArray(input.bannedRanges);
  if (banned) {
    partial.bannedRanges = banned;
  }
  if (typeof input.preferExact === "boolean") {
    partial.preferExact = input.preferExact;
  }
  if (isAlignmentAction(input.alignment)) {
    partial.alignment = input.alignment;
  }
  const packageRoot = parsePackageRoot(input.packageRoot);
  if (packageRoot !== undefined) {
    partial.packageRoot = packageRoot;
  }
  if (Array.isArray(input.alignedGroups)) {
    partial.alignedGroups = input.alignedGroups.flatMap((group) => {
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        return [];
      }
      const g = group as Record<string, unknown>;
      if (typeof g.name !== "string" || typeof g.source !== "string") {
        return [];
      }
      const packages = asStringArray(g.packages);
      if (!packages) {
        return [];
      }
      return [
        {
          name: g.name,
          source: g.source,
          packages,
          onMismatch: isAlignmentAction(g.onMismatch)
            ? g.onMismatch
            : undefined,
        },
      ];
    });
  }
  return partial;
}

/**
 * Merges partial configs so later sources win per field.
 */
function mergePartials(partials: Partial<BeefupConfig>[]): Partial<BeefupConfig> {
  const merged: Partial<BeefupConfig> = {};
  for (const part of partials) {
    if (part.mode !== undefined) {
      merged.mode = part.mode;
    }
    if (part.bannedRanges !== undefined) {
      merged.bannedRanges = part.bannedRanges;
    }
    if (part.preferExact !== undefined) {
      merged.preferExact = part.preferExact;
    }
    if (part.alignment !== undefined) {
      merged.alignment = part.alignment;
    }
    if (part.alignedGroups !== undefined) {
      merged.alignedGroups = part.alignedGroups;
    }
    if (part.packageRoot !== undefined) {
      merged.packageRoot = part.packageRoot;
    }
  }
  return merged;
}

/**
 * Loads `.beefup.json`, `package.json#beefup`, and `pnpm-workspace.yaml#beefup` from a directory.
 * Missing files are skipped; a missing root `package.json` is not an error.
 */
export async function loadConfigFromDir(
  dir: string
): Promise<Partial<BeefupConfig>> {
  const fromFile = await loadBeefupJson(dir);
  const fromPkg = await loadPackageJsonBeefup(dir);
  const fromWorkspace = await loadWorkspaceBeefup(dir);
  return mergePartials([fromFile, fromPkg, fromWorkspace]);
}

/**
 * Reads `.beefup.json` from `dir` when present.
 */
async function loadBeefupJson(dir: string): Promise<Partial<BeefupConfig>> {
  const filePath = path.join(dir, BeefupConfigFileName);
  if (!(await pathExists(filePath))) {
    return {};
  }
  return parsePartial(await readJsonFile<unknown>(filePath));
}

/**
 * Reads `package.json#beefup` from `dir` when the file exists.
 */
async function loadPackageJsonBeefup(
  dir: string
): Promise<Partial<BeefupConfig>> {
  const pkgPath = path.join(dir, "package.json");
  if (!(await pathExists(pkgPath))) {
    return {};
  }
  const pkg = await readJsonFile<PackageJson>(pkgPath);
  return parsePartial(pkg.beefup);
}

/**
 * Reads `pnpm-workspace.yaml#beefup` from `dir` when the file exists.
 */
async function loadWorkspaceBeefup(
  dir: string
): Promise<Partial<BeefupConfig>> {
  const workspacePath = path.join(dir, "pnpm-workspace.yaml");
  if (!(await pathExists(workspacePath))) {
    return {};
  }
  const parsed = parseYaml(await readFile(workspacePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsePartial((parsed as Record<string, unknown>).beefup);
}

/**
 * Loads and merges Beefup config from repo-level files and the package being upgraded.
 * An optional mode override (e.g. CLI `--mode`) wins over file config.
 */
export async function loadConfig(
  projectRoot: string,
  packageRoot = projectRoot,
  modeOverride?: UpgradeMode
): Promise<BeefupConfig> {
  const pkgPath = path.join(packageRoot, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new BeefupError(`no package.json at ${pkgPath}`);
  }

  const repo = await loadConfigFromDir(projectRoot);
  const sameDir =
    path.resolve(projectRoot) === path.resolve(packageRoot);
  const pkg = sameDir ? {} : await loadConfigFromDir(packageRoot);
  const mergedPartial = mergePartials([repo, pkg]);
  const merged: BeefupConfig = {
    ...DEFAULT_CONFIG,
    ...mergedPartial,
    bannedRanges:
      mergedPartial.bannedRanges ?? DEFAULT_CONFIG.bannedRanges,
    alignedGroups:
      mergedPartial.alignedGroups ?? DEFAULT_CONFIG.alignedGroups,
  };

  if (modeOverride) {
    merged.mode = modeOverride;
  }
  return merged;
}
