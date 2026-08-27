import semver from "semver";

import { BannedRangeTags } from "../config/types.js";
import { stripPnpmPeerSuffix } from "../lockfile/pnpm.js";
import type { NpmLockfile, PnpmLockfile } from "../lockfile/types.js";
import type { PackageJson } from "../project/package-json.js";
import { PackageManagers, type PackageManager } from "../project/types.js";

export interface OverrideFinding {
  override: string;
  message: string;
}

const BANNED_OVERRIDE_TAGS: Set<string> = new Set([BannedRangeTags.Latest]);

/**
 * Parses an override key into a package name and optional version selector.
 */
function parseOverrideKey(key: string): { name: string; selector: string | null } {
  if (key.startsWith("@")) {
    const slash = key.indexOf("/");
    if (slash === -1) {
      return { name: key, selector: null };
    }
    const at = key.indexOf("@", slash);
    if (at === -1) {
      return { name: key, selector: null };
    }
    return { name: key.slice(0, at), selector: key.slice(at + 1) };
  }
  const at = key.indexOf("@");
  if (at === -1) {
    return { name: key, selector: null };
  }
  return { name: key.slice(0, at), selector: key.slice(at + 1) };
}

/**
 * Resolves `$dep` override references against direct package.json dependencies.
 */
function resolveDollarRef(value: string, pkg: PackageJson): string {
  if (!value.startsWith("$")) {
    return value;
  }
  const ref = value.slice(1);
  const buckets = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.optionalDependencies,
    pkg.peerDependencies,
  ];
  for (const bucket of buckets) {
    if (bucket && typeof bucket[ref] === "string") {
      return bucket[ref];
    }
  }
  throw new Error(`override value "${value}" references missing dependency "${ref}"`);
}

/**
 * Returns true when an override target uses a banned floating tag such as latest.
 */
function isBannedOverrideTarget(raw: string): boolean {
  const value = raw.trim();
  if (BANNED_OVERRIDE_TAGS.has(value.toLowerCase())) {
    return true;
  }
  const npmAlias = value.match(/^npm:(@?[^@]+)@(.+)$/);
  if (npmAlias && BANNED_OVERRIDE_TAGS.has(npmAlias[2].toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Resolves an override target string into a concrete semver version when possible.
 */
function parseOverrideTarget(
  raw: string,
  pkg: PackageJson
): { version: string | null; raw: string } {
  const value = resolveDollarRef(raw, pkg);
  const npmAlias = value.match(/^npm:(@?[^@]+)@(.+)$/);
  if (npmAlias) {
    const version = npmAlias[2];
    return { version: semver.valid(version) ? version : null, raw: value };
  }
  if (semver.valid(value)) {
    return { version: value, raw: value };
  }
  return { version: null, raw: value };
}

interface FlatPin {
  logicalName: string;
  selector: string | null;
  targetRaw: string;
  trail: string[];
  scopedTo: string | null;
}

/**
 * Flattens nested npm/pnpm override maps into individual pin records.
 */
function flattenOverrides(
  node: Record<string, unknown>,
  trail: string[] = [],
  scopedTo: string | null = null
): FlatPin[] {
  const pins: FlatPin[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      const { name, selector } = parseOverrideKey(key);
      pins.push({
        logicalName: name,
        selector,
        targetRaw: value,
        trail: [...trail, key],
        scopedTo,
      });
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    const nested = value as Record<string, unknown>;
    const { name: parentName } = parseOverrideKey(key);
    if (typeof nested["."] === "string") {
      const { name, selector } = parseOverrideKey(key);
      pins.push({
        logicalName: name,
        selector,
        targetRaw: nested["."],
        trail: [...trail, key, "."],
        scopedTo,
      });
    }
    for (const [childKey, childVal] of Object.entries(nested)) {
      if (childKey === ".") {
        continue;
      }
      if (typeof childVal === "string") {
        const { name, selector } = parseOverrideKey(childKey);
        pins.push({
          logicalName: name,
          selector,
          targetRaw: childVal,
          trail: [...trail, key, childKey],
          scopedTo: parentName,
        });
      } else if (childVal && typeof childVal === "object") {
        pins.push(
          ...flattenOverrides({ [childKey]: childVal }, [...trail, key], parentName)
        );
      }
    }
  }
  return pins;
}

/**
 * Collects dependency request ranges for a package from a normalized lockfile.
 */
function collectRequestedRanges(
  packageName: string,
  lock: { packages?: Record<string, unknown> }
): Array<{ from: string; range: string }> {
  const requests: Array<{ from: string; range: string }> = [];
  const packages = (lock.packages ?? {}) as Record<string, unknown>;
  for (const [lockKey, meta] of Object.entries(packages)) {
    if (!meta || typeof meta !== "object") {
      continue;
    }
    const entry = meta as Record<string, unknown>;
    const depBuckets = [
      entry.dependencies,
      entry.optionalDependencies,
      entry.peerDependencies,
      entry.devDependencies,
    ];
    for (const bucket of depBuckets) {
      if (!bucket || typeof bucket !== "object") {
        continue;
      }
      const deps = bucket as Record<string, unknown>;
      if (typeof deps[packageName] !== "string") {
        continue;
      }
      const from =
        lockKey === "" ? "(root package.json)" : lockKey.replace(/^node_modules\//, "");
      requests.push({ from, range: stripPnpmPeerSuffix(deps[packageName] as string) });
    }
  }
  return requests;
}

/**
 * Converts a pnpm lockfile into an npm-like packages map for override checks.
 */
function normalizePnpmLock(lock: PnpmLockfile): { packages: Record<string, unknown> } {
  const packages: Record<string, Record<string, unknown>> = {};
  const importers = lock.importers ?? {};
  for (const [importerPath, meta] of Object.entries(importers)) {
    const key = importerPath === "." ? "" : importerPath;
    /**
     * Extracts specifier strings from a pnpm importer dependency bucket.
     */
    const take = (
      bucket: Record<string, { specifier?: string; version?: string } | string> | undefined
    ): Record<string, string> => {
      const out: Record<string, string> = {};
      if (!bucket) {
        return out;
      }
      for (const [name, info] of Object.entries(bucket)) {
        if (typeof info === "string") {
          out[name] = info;
          continue;
        }
        if (info && typeof info.specifier === "string") {
          out[name] = info.specifier;
        }
      }
      return out;
    };
    packages[key] = {
      dependencies: take(meta.dependencies),
      optionalDependencies: take(meta.optionalDependencies),
      peerDependencies: take(meta.peerDependencies),
      devDependencies: take(meta.devDependencies),
    };
  }

  /**
   * Merges resolved dependency maps from packages/snapshots into `packages`.
   */
  const takeResolved = (section: Record<string, unknown> | undefined) => {
    if (!section) {
      return;
    }
    for (const [lockKey, meta] of Object.entries(section)) {
      if (!meta || typeof meta !== "object") {
        continue;
      }
      const entry = meta as Record<string, unknown>;
      if (!packages[lockKey]) {
        packages[lockKey] = {};
      }
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        const bucket = entry[field];
        if (!bucket || typeof bucket !== "object") {
          continue;
        }
        const out = {
          ...((packages[lockKey][field] as Record<string, string> | undefined) ?? {}),
        };
        for (const [name, value] of Object.entries(bucket as Record<string, unknown>)) {
          if (typeof value === "string") {
            out[name] = value;
          }
        }
        packages[lockKey][field] = out;
      }
    }
  };

  takeResolved(lock.packages as Record<string, unknown> | undefined);
  takeResolved(lock.snapshots as Record<string, unknown> | undefined);
  return { packages };
}

/**
 * Returns true when a dependency request falls within an override selector scope.
 */
function requestInOverrideScope(
  requestRange: string,
  selector: string | null
): boolean {
  if (!selector) {
    return true;
  }
  if (!semver.validRange(selector) || !semver.validRange(requestRange)) {
    return false;
  }
  return semver.intersects(requestRange, selector, true);
}

/**
 * Returns true when a pin version is strictly below a requested range's minimum.
 */
function pinBelowRequest(pinVersion: string, requestRange: string): boolean {
  if (semver.satisfies(pinVersion, requestRange, { includePrerelease: true })) {
    return false;
  }
  const minimum = semver.minVersion(requestRange);
  if (!minimum) {
    return false;
  }
  return semver.lt(pinVersion, minimum);
}

/**
 * Finds override pins that are banned floating tags or below requested ranges.
 */
export function findStaleOverridePins(
  pkg: PackageJson,
  lock: NpmLockfile | { packages?: Record<string, unknown> }
): OverrideFinding[] {
  const overrides = pkg.overrides;
  if (!overrides || typeof overrides !== "object") {
    return [];
  }
  const errors: OverrideFinding[] = [];
  const pins = flattenOverrides(overrides as Record<string, unknown>);

  for (const pin of pins) {
    const label = pin.trail.join(" → ");
    let target: { version: string | null; raw: string };
    try {
      target = parseOverrideTarget(pin.targetRaw, pkg);
    } catch (err) {
      errors.push({
        override: label,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (isBannedOverrideTarget(target.raw)) {
      errors.push({
        override: label,
        message: `pin must not use floating tag "${BannedRangeTags.Latest}" (got ${target.raw}); pin a concrete semver version instead`,
      });
      continue;
    }

    if (!target.version || !semver.valid(target.version)) {
      continue;
    }
    const requests = collectRequestedRanges(pin.logicalName, lock);
    const seen = new Set<string>();
    for (const req of requests) {
      if (req.range.startsWith("npm:") || req.range.startsWith("file:")) {
        continue;
      }
      if (!semver.validRange(req.range)) {
        continue;
      }
      if (!requestInOverrideScope(req.range, pin.selector)) {
        continue;
      }
      if (pin.scopedTo) {
        const fromName = req.from.split("/node_modules/").pop();
        if (fromName !== pin.scopedTo) {
          continue;
        }
      }
      const key = `${req.from}::${req.range}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (pinBelowRequest(target.version, req.range)) {
        const minimum = semver.minVersion(req.range);
        errors.push({
          override: label,
          message:
            `pin ${pin.logicalName}@${target.version} is below ` +
            `${req.from} → ${pin.logicalName}@${req.range}` +
            (minimum ? ` (minimum ${minimum.version})` : ""),
        });
      }
    }
  }
  return errors;
}

/**
 * Finds keys where package.json and pnpm-workspace.yaml overrides disagree.
 */
export function findWorkspaceOverrideDrift(
  pkg: PackageJson,
  workspaceOverrides: Record<string, unknown> | undefined
): OverrideFinding[] {
  if (!workspaceOverrides) {
    return [];
  }
  const pkgOverrides =
    pkg.overrides && typeof pkg.overrides === "object" ? pkg.overrides : {};
  const errors: OverrideFinding[] = [];
  const keys = new Set([...Object.keys(pkgOverrides), ...Object.keys(workspaceOverrides)]);
  for (const key of keys) {
    const left = JSON.stringify(pkgOverrides[key] ?? null);
    const right = JSON.stringify(workspaceOverrides[key] ?? null);
    if (left !== right) {
      errors.push({
        override: key,
        message:
          `package.json#overrides and pnpm-workspace.yaml#overrides disagree ` +
          `(package.json=${left}, workspace=${right})`,
      });
    }
  }
  return errors;
}

/**
 * Normalizes a lockfile into the packages shape used by override pin checks.
 */
export function normalizeLockForOverrides(
  packageManager: PackageManager,
  lock: NpmLockfile | PnpmLockfile
): { packages?: Record<string, unknown> } {
  if (packageManager === PackageManagers.Pnpm) {
    return normalizePnpmLock(lock as PnpmLockfile);
  }
  return lock as NpmLockfile;
}

export { parseOverrideKey, flattenOverrides };
