/** How a package name changed between two lockfile resolutions. */
export const PackageChangeTypes = {
  Added: "added",
  Removed: "removed",
  Changed: "changed",
} as const;

/** Package change kind (added, removed, or changed at one or more scopes). */
export type PackageChangeType =
  (typeof PackageChangeTypes)[keyof typeof PackageChangeTypes];

/** One concrete install of a package at a specific lockfile scope/path. */
export interface ScopedVersion {
  path: string;
  version: string;
}

/**
 * Diff entry for one package name across all of its scoped installs.
 * `from` / `to` are scope-aware; renderers may show unique version tags only.
 */
export interface PackageChange {
  name: string;
  type: PackageChangeType;
  from: ScopedVersion[];
  to: ScopedVersion[];
  /** True when the package is declared in a workspace package.json. */
  direct?: boolean;
  /** True when the package is optional/platform in the lockfile or manifests. */
  optional?: boolean;
}

export interface ResolutionDiff {
  dependencies: PackageChange[];
  devDependencies: PackageChange[];
}

/** Buckets package changes by added / removed / changed for reporting. */
export interface GroupedChanges {
  added: PackageChange[];
  removed: PackageChange[];
  changed: PackageChange[];
}
