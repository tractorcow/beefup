import semver from "semver";

import type { UpgradeMode } from "../config/types.js";
import {
  DIRECT_DEP_FIELDS,
  type PackageJson,
} from "../project/package-json.js";

const SKIP_SPEC =
  /^(workspace:|file:|link:|catalog:|npm:|http:|https:|git\+|git:|github:|gitlab:|bitbucket:|portal:|pkg:)/;

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

export function declaredVersion(spec: string): string | null {
  if (semver.valid(spec)) {
    return spec;
  }
  const min = semver.minVersion(spec);
  return min ? min.version : null;
}

export function rewriteConstraint(spec: string, mode: UpgradeMode): string | null {
  if (shouldSkipSpec(spec)) {
    return null;
  }
  const version = declaredVersion(spec);
  if (!version) {
    return null;
  }
  return mode === "latest" ? `>=${version}` : `^${version}`;
}

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
