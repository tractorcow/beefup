import {
  DIRECT_DEP_FIELDS,
  type PackageJson,
} from "../project/package-json.js";
import { shouldSkipSpec } from "./constraints.js";

/** Map of package name → locked version used when re-pinning ranges. */
export type LockedVersions = Map<string, string>;

/**
 * Replaces direct dependency specs with exact locked versions where available.
 * Skips specs that should not be rewritten (e.g. workspace/link protocols).
 */
export function rePinPackageJson(
  pkg: PackageJson,
  locked: LockedVersions
): PackageJson {
  const next: PackageJson = { ...pkg };
  for (const field of DIRECT_DEP_FIELDS) {
    const bucket = pkg[field];
    if (!bucket) {
      continue;
    }
    const rewritten: Record<string, string> = { ...bucket };
    for (const [name, spec] of Object.entries(bucket)) {
      if (shouldSkipSpec(spec)) {
        continue;
      }
      const version = locked.get(name);
      if (version) {
        rewritten[name] = version;
      }
    }
    next[field] = rewritten;
  }
  return next;
}
