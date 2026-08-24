import { diff, gt, parse, valid } from "semver";

import type { LockPackage, Resolution } from "../lockfile/types.js";
import {
  PackageChangeType,
  VersionChangeType,
  type PackageChange,
  type ResolutionDiff,
} from "./types.js";

/**
 * Compares two lockfile resolutions and returns added, removed, upgraded,
 * and downgraded package changes for dependencies and devDependencies.
 */
export function diffResolutions(
  source: Resolution,
  target: Resolution
): ResolutionDiff {
  return {
    dependencies: diffPackages(source.dependencies, target.dependencies),
    devDependencies: diffPackages(
      source.devDependencies,
      target.devDependencies
    ),
  };
}

/**
 * Diffs two package lists by name, recording adds, removals, and version moves.
 */
function diffPackages(source: LockPackage[], target: LockPackage[]): PackageChange[] {
  const sourceMap = new Map(source.map((pkg) => [pkg.name, pkg]));
  const targetMap = new Map(target.map((pkg) => [pkg.name, pkg]));
  const changes: PackageChange[] = [];

  for (const [name, sourcePkg] of sourceMap.entries()) {
    const targetPkg = targetMap.get(name);
    if (!targetPkg) {
      changes.push({
        name,
        type: PackageChangeType.Removed,
        fromVersion: sourcePkg.version,
      });
      continue;
    }
    if (sourcePkg.version === targetPkg.version) {
      continue;
    }
    const versionInfo = getVersionChangeType(sourcePkg.version, targetPkg.version);
    if (versionInfo) {
      changes.push({
        name,
        type: versionInfo.direction,
        versionChange: versionInfo.type,
        fromVersion: sourcePkg.version,
        toVersion: targetPkg.version,
      });
    }
  }

  for (const [name, targetPkg] of targetMap.entries()) {
    if (!sourceMap.has(name)) {
      changes.push({
        name,
        type: PackageChangeType.Added,
        toVersion: targetPkg.version,
      });
    }
  }

  return changes;
}

/**
 * Classifies a from→to version pair as major/minor/patch and upgrade vs downgrade.
 * Returns null when either version is not a valid semver string.
 */
function getVersionChangeType(
  from: string,
  to: string
): {
  type: VersionChangeType;
  direction: PackageChangeType.Upgraded | PackageChangeType.Downgraded;
} | null {
  if (!valid(from) || !valid(to)) {
    return null;
  }
  const fromParsed = parse(from);
  const toParsed = parse(to);
  if (!fromParsed || !toParsed) {
    return null;
  }
  if (fromParsed.major !== toParsed.major) {
    return createVersionChangeInfo(VersionChangeType.Major, to, from);
  }
  if (fromParsed.minor !== toParsed.minor) {
    return createVersionChangeInfo(VersionChangeType.Minor, to, from);
  }
  if (fromParsed.patch !== toParsed.patch) {
    return createVersionChangeInfo(VersionChangeType.Patch, to, from);
  }
  const changeType = diff(from, to);
  if (!changeType) {
    return null;
  }
  return createVersionChangeInfo(VersionChangeType.Patch, to, from);
}

/**
 * Builds version-change metadata with upgrade/downgrade direction from semver order.
 */
function createVersionChangeInfo(
  type: VersionChangeType,
  to: string,
  from: string
): {
  type: VersionChangeType;
  direction: PackageChangeType.Upgraded | PackageChangeType.Downgraded;
} {
  return {
    type,
    direction: gt(to, from)
      ? PackageChangeType.Upgraded
      : PackageChangeType.Downgraded,
  };
}
