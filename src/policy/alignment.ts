import {
  AlignmentActions,
  type AlignedGroup,
  type AlignmentAction,
  type BeefupConfig,
} from "../config/types.js";
import { extractPackageInfoFromName } from "../lockfile/pnpm.js";
import type { NpmLockfile, PnpmLockfile } from "../lockfile/types.js";
import {
  DIRECT_DEP_FIELDS,
  type PackageJson,
} from "../project/package-json.js";
import { PackageManagers, type PackageManager } from "../project/types.js";

export interface AlignmentFinding {
  group: string;
  message: string;
  severity: AlignmentAction;
}

/**
 * Reads a pinned override value, including nested `"."` map forms.
 */
function overridePin(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>)["."] === "string") {
    return (value as Record<string, string>)["."];
  }
  return null;
}

/**
 * Returns the direct-dependency version spec for `source` from package.json.
 */
function expectedVersion(pkg: PackageJson, source: string): string | undefined {
  for (const field of DIRECT_DEP_FIELDS) {
    const spec = pkg[field]?.[source];
    if (spec) {
      return spec;
    }
  }
  return undefined;
}

/**
 * Collects resolved lockfile versions for the given package names.
 */
function collectLockVersions(
  packageManager: PackageManager,
  lock: NpmLockfile | PnpmLockfile,
  names: Set<string>
): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  /** Records a resolved version for a package name when it is in scope. */
  const add = (name: string, version: string) => {
    if (!names.has(name)) {
      return;
    }
    const set = found.get(name) ?? new Set<string>();
    set.add(version);
    found.set(name, set);
  };

  if (packageManager === PackageManagers.Npm) {
    const packages = (lock as NpmLockfile).packages ?? {};
    for (const [key, meta] of Object.entries(packages)) {
      if (!meta?.version) {
        continue;
      }
      const parts = key.split("node_modules/");
      const name = parts[parts.length - 1];
      if (name) {
        add(name, meta.version);
      }
    }
    return found;
  }

  const pnpm = lock as PnpmLockfile;
  for (const [key, meta] of Object.entries(pnpm.packages ?? {})) {
    const info = extractPackageInfoFromName(key);
    if (!info) {
      continue;
    }
    const version = meta?.version ?? info.version;
    if (version) {
      add(info.name, version);
    }
  }
  for (const key of Object.keys(pnpm.snapshots ?? {})) {
    const info = extractPackageInfoFromName(key);
    if (info?.version) {
      add(info.name, info.version);
    }
  }
  return found;
}

/**
 * Checks one aligned group for package.json, override, and lockfile mismatches.
 */
function checkGroup(
  group: AlignedGroup,
  pkg: PackageJson,
  packageManager: PackageManager,
  lock: NpmLockfile | PnpmLockfile,
  workspaceOverrides: Record<string, unknown> | undefined,
  defaultAction: AlignmentAction
): AlignmentFinding[] {
  const severity = group.onMismatch ?? defaultAction;
  const expected = expectedVersion(pkg, group.source);
  const findings: AlignmentFinding[] = [];
  if (!expected) {
    findings.push({
      group: group.name,
      severity,
      message: `source package ${group.source} is not a direct dependency`,
    });
    return findings;
  }
  if (/[^\d.]/.test(expected)) {
    findings.push({
      group: group.name,
      severity,
      message: `${group.source} must be an exact version, got "${expected}"`,
    });
    return findings;
  }

  const names = new Set([group.source, ...group.packages]);
  for (const field of DIRECT_DEP_FIELDS) {
    const bucket = pkg[field];
    if (!bucket) {
      continue;
    }
    for (const name of names) {
      const actual = bucket[name];
      if (actual && actual !== expected) {
        findings.push({
          group: group.name,
          severity,
          message: `${field}["${name}"] is ${actual}, expected ${expected}`,
        });
      }
    }
  }

  const overrideMaps: Array<{ label: string; map: Record<string, unknown> }> = [];
  if (pkg.overrides && typeof pkg.overrides === "object") {
    overrideMaps.push({ label: "package.json#overrides", map: pkg.overrides });
  }
  if (workspaceOverrides) {
    overrideMaps.push({
      label: "pnpm-workspace.yaml#overrides",
      map: workspaceOverrides,
    });
  }
  for (const { label, map } of overrideMaps) {
    for (const name of group.packages) {
      if (name === group.source) {
        continue;
      }
      if (map[name] === undefined) {
        continue;
      }
      const pinned = overridePin(map[name]);
      if (pinned !== expected) {
        findings.push({
          group: group.name,
          severity,
          message: `${label}["${name}"] is ${JSON.stringify(pinned)}, expected "${expected}"`,
        });
      }
    }
  }

  const found = collectLockVersions(packageManager, lock, names);
  for (const name of names) {
    const versions = found.get(name);
    if (!versions) {
      continue;
    }
    const unexpected = [...versions].filter((version) => version !== expected);
    if (unexpected.length) {
      findings.push({
        group: group.name,
        severity,
        message: `${name}: lockfile has ${[...versions].sort().join(", ")}, expected ${expected}`,
      });
    }
  }

  return findings;
}

/**
 * Finds alignment mismatches for every configured group in the project.
 */
export function findAlignmentIssues(
  config: BeefupConfig,
  pkg: PackageJson,
  packageManager: PackageManager,
  lock: NpmLockfile | PnpmLockfile,
  workspaceOverrides?: Record<string, unknown>
): AlignmentFinding[] {
  const findings: AlignmentFinding[] = [];
  for (const group of config.alignedGroups) {
    findings.push(
      ...checkGroup(
        group,
        pkg,
        packageManager,
        lock,
        workspaceOverrides,
        config.alignment ?? AlignmentActions.Error
      )
    );
  }
  return findings;
}
