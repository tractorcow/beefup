import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import type { PackageJson } from "../project/package-json.js";
import {
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
  if (value.every((item) => typeof item === "string")) {
    return value;
  }
  return undefined;
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
 * Loads and merges Beefup config from package.json and pnpm-workspace.yaml.
 * An optional mode override (e.g. CLI `--mode`) wins over file config.
 */
export async function loadConfig(
  projectRoot: string,
  modeOverride?: UpgradeMode
): Promise<BeefupConfig> {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new BeefupError(`no package.json at ${pkgPath}`);
  }
  const pkg = await readJsonFile<PackageJson>(pkgPath);
  const fromPkg = parsePartial(pkg.beefup);

  let fromWorkspace: Partial<BeefupConfig> = {};
  const workspacePath = path.join(projectRoot, "pnpm-workspace.yaml");
  if (await pathExists(workspacePath)) {
    const parsed = parseYaml(await readFile(workspacePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      fromWorkspace = parsePartial((parsed as Record<string, unknown>).beefup);
    }
  }

  const merged: BeefupConfig = {
    ...DEFAULT_CONFIG,
    ...fromPkg,
    ...fromWorkspace,
    bannedRanges:
      fromWorkspace.bannedRanges ??
      fromPkg.bannedRanges ??
      DEFAULT_CONFIG.bannedRanges,
    alignedGroups:
      fromWorkspace.alignedGroups ??
      fromPkg.alignedGroups ??
      DEFAULT_CONFIG.alignedGroups,
  };

  if (modeOverride) {
    merged.mode = modeOverride;
  }
  return merged;
}
