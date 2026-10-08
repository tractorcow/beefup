import type { UpgradeMode } from "../config/types.js";
import { parseOverrideKey } from "../policy/overrides.js";
import type { PackageJson } from "../project/package-json.js";
import { rewriteConstraint, shouldSkipSpec } from "./constraints.js";
import type { LockedVersions } from "./repin.js";

/**
 * True when an override target should not be rewritten or re-pinned
 * (protocol specs, `$dep` references, and similar).
 */
function shouldSkipOverrideTarget(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("$")) {
    return true;
  }
  return shouldSkipSpec(trimmed);
}

/**
 * Rewrites string leaves in an overrides map for the upgrade mode.
 * Nested maps (including `"."` self-pins) are walked; skipped targets stay unchanged.
 */
export function rewriteOverrideMap(
  overrides: Record<string, unknown>,
  mode: UpgradeMode
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      if (shouldSkipOverrideTarget(value)) {
        next[key] = value;
        continue;
      }
      next[key] = rewriteConstraint(value, mode) ?? value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = rewriteOverrideMap(value as Record<string, unknown>, mode);
      continue;
    }
    next[key] = value;
  }
  return next;
}

/**
 * Re-pins string leaves in an overrides map to exact locked versions.
 * Uses the override key's package name (or the parent name for `"."` entries).
 */
export function rePinOverrideMap(
  overrides: Record<string, unknown>,
  locked: LockedVersions,
  parentName: string | null = null
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      if (shouldSkipOverrideTarget(value)) {
        next[key] = value;
        continue;
      }
      const packageName =
        key === "." && parentName ? parentName : parseOverrideKey(key).name;
      const version = locked.get(packageName);
      next[key] = version ?? value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const { name } = parseOverrideKey(key);
      next[key] = rePinOverrideMap(
        value as Record<string, unknown>,
        locked,
        name
      );
      continue;
    }
    next[key] = value;
  }
  return next;
}

/**
 * Rewrites `package.json#overrides` string targets for the upgrade mode.
 */
export function rewritePackageJsonOverrides(
  pkg: PackageJson,
  mode: UpgradeMode
): PackageJson {
  if (!pkg.overrides || typeof pkg.overrides !== "object") {
    return pkg;
  }
  return {
    ...pkg,
    overrides: rewriteOverrideMap(pkg.overrides, mode),
  };
}

/**
 * Re-pins `package.json#overrides` string targets to locked versions.
 */
export function rePinPackageJsonOverrides(
  pkg: PackageJson,
  locked: LockedVersions
): PackageJson {
  if (!pkg.overrides || typeof pkg.overrides !== "object") {
    return pkg;
  }
  return {
    ...pkg,
    overrides: rePinOverrideMap(pkg.overrides, locked),
  };
}
