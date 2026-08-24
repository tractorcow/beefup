import {
  PackageChangeType,
  VersionChangeType,
  type GroupedChanges,
  type PackageChange,
} from "./types.js";

/**
 * Buckets package changes by major/minor/patch upgrades, plus added, removed,
 * and downgraded groups for reporting.
 */
export function groupByVersionChange(changes: PackageChange[]): GroupedChanges {
  const result: GroupedChanges = {
    major: [],
    minor: [],
    patch: [],
    added: [],
    removed: [],
    downgraded: [],
  };

  for (const change of changes) {
    if (change.type === PackageChangeType.Upgraded && change.versionChange) {
      if (change.versionChange === VersionChangeType.Major) {
        result.major.push(change);
      } else if (change.versionChange === VersionChangeType.Minor) {
        result.minor.push(change);
      } else if (change.versionChange === VersionChangeType.Patch) {
        result.patch.push(change);
      }
    } else if (change.type === PackageChangeType.Downgraded) {
      result.downgraded.push(change);
    } else if (change.type === PackageChangeType.Added) {
      result.added.push(change);
    } else if (change.type === PackageChangeType.Removed) {
      result.removed.push(change);
    }
  }

  return result;
}
