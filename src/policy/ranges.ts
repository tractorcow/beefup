import semver from "semver";

import type { BeefupConfig } from "../config/types.js";
import {
  DIRECT_DEP_FIELDS,
  type PackageJson,
} from "../project/package-json.js";
import { shouldSkipSpec } from "../rewrite/constraints.js";

export interface RangeFinding {
  packageName: string;
  field: string;
  spec: string;
  severity: "error" | "warn";
  message: string;
}

function isBanned(spec: string, banned: string[]): boolean {
  const trimmed = spec.trim().toLowerCase();
  return banned.some((item) => item.toLowerCase() === trimmed);
}

function isLooseRange(spec: string): boolean {
  if (semver.valid(spec)) {
    return false;
  }
  return Boolean(semver.validRange(spec));
}

export function findRangeIssues(
  pkg: PackageJson,
  config: BeefupConfig,
  fromLabel: string
): RangeFinding[] {
  const findings: RangeFinding[] = [];
  for (const field of DIRECT_DEP_FIELDS) {
    const bucket = pkg[field];
    if (!bucket) {
      continue;
    }
    for (const [name, spec] of Object.entries(bucket)) {
      if (shouldSkipSpec(spec)) {
        continue;
      }
      if (isBanned(spec, config.bannedRanges)) {
        findings.push({
          packageName: name,
          field: `${fromLabel}#${field}`,
          spec,
          severity: "error",
          message: `${name} uses banned range "${spec}"`,
        });
        continue;
      }
      if (config.preferExact && isLooseRange(spec)) {
        findings.push({
          packageName: name,
          field: `${fromLabel}#${field}`,
          spec,
          severity: "warn",
          message: `${name} is not exact-pinned ("${spec}")`,
        });
      }
    }
  }
  return findings;
}
