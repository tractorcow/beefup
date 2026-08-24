import semver from "semver";

import { UpgradeModes, type UpgradeMode } from "../config/types.js";
import {
  DIRECT_DEP_FIELDS,
  type PackageJson,
} from "../project/package-json.js";

const SKIP_SPEC =
  /^(workspace:|file:|link:|catalog:|npm:|http:|https:|git\+|git:|github:|gitlab:|bitbucket:|portal:|pkg:)/;

/**
 * Returns true when a dependency spec should not be rewritten (protocols, paths).
 */
export function shouldSkipSpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (SKIP_SPEC.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith(".") || trimmed.startsWith("/")) {
    return true;
  }
  return false;
}

/**
 * Extracts a concrete semver version from an exact pin or range minimum.
 */
export function declaredVersion(spec: string): string | null {
  if (semver.valid(spec)) {
    return spec;
  }
  const min = semver.minVersion(spec);
  return min ? min.version : null;
}

/**
 * Rewrites a dependency constraint for same-major (^) or latest (>=) upgrade mode.
 * Returns null when the spec cannot or should not be rewritten.
 */
export function rewriteConstraint(spec: string, mode: UpgradeMode): string | null {
  if (shouldSkipSpec(spec)) {
    return null;
  }
  const version = declaredVersion(spec);
  if (!version) {
    return null;
  }
  return mode === UpgradeModes.Latest ? `>=${version}` : `^${version}`;
}

/**
 * Rewrites direct dependency constraints in a package.json for the given mode.
 * Leaves peerDependencies and non-rewritable specs unchanged.
 */
export function rewritePackageJson(
  pkg: PackageJson,
  mode: UpgradeMode
): PackageJson {
  const next: PackageJson = { ...pkg };
  for (const field of DIRECT_DEP_FIELDS) {
    const bucket = pkg[field];
    if (!bucket) {
      continue;
    }
    const rewritten: Record<string, string> = { ...bucket };
    for (const [name, spec] of Object.entries(bucket)) {
      const updated = rewriteConstraint(spec, mode);
      if (updated) {
        rewritten[name] = updated;
      }
    }
    next[field] = rewritten;
  }
  return next;
}
