export enum PackageChangeType {
  Added = "added",
  Removed = "removed",
  Upgraded = "upgraded",
  Downgraded = "downgraded",
}

export enum VersionChangeType {
  Major = "major",
  Minor = "minor",
  Patch = "patch",
}

export interface PackageChange {
  name: string;
  type: PackageChangeType;
  versionChange?: VersionChangeType;
  fromVersion?: string;
  toVersion?: string;
}

export interface ResolutionDiff {
  dependencies: PackageChange[];
  devDependencies: PackageChange[];
}

export interface GroupedChanges {
  major: PackageChange[];
  minor: PackageChange[];
  patch: PackageChange[];
  added: PackageChange[];
  removed: PackageChange[];
  downgraded: PackageChange[];
}
