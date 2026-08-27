import {
  PackageChangeTypes,
  type GroupedChanges,
  type PackageChange,
} from "./types.js";

/**
 * Buckets package changes into added, removed, and changed groups for reporting.
 */
export function groupByChangeType(changes: PackageChange[]): GroupedChanges {
  const result: GroupedChanges = {
    added: [],
    removed: [],
    changed: [],
  };

  for (const change of changes) {
    if (change.type === PackageChangeTypes.Added) {
      result.added.push(change);
    } else if (change.type === PackageChangeTypes.Removed) {
      result.removed.push(change);
    } else if (change.type === PackageChangeTypes.Changed) {
      result.changed.push(change);
    }
  }

  return result;
}
