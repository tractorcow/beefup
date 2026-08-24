import type { LockPackage, Resolution } from "../lockfile/types.js";
import {
  PackageChangeTypes,
  type PackageChange,
  type ResolutionDiff,
  type ScopedVersion,
} from "./types.js";

/**
 * Compares two lockfile resolutions and returns added, removed, and changed
 * packages. Versions are compared path-for-path within each package name.
 * Path-only churn (identical unique versions) is omitted.
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
 * Annotates diff entries with direct-dependency and optional/platform flags.
 */
export function annotatePackageChanges(
  diff: ResolutionDiff,
  options: {
    directNames: ReadonlySet<string>;
    optionalDeclaredNames: ReadonlySet<string>;
    before: Resolution;
    after: Resolution;
  }
): ResolutionDiff {
  return {
    dependencies: annotateList(diff.dependencies, options, "dependencies"),
    devDependencies: annotateList(
      diff.devDependencies,
      options,
      "devDependencies"
    ),
  };
}

/**
 * Diffs two package lists by name, comparing only matching scopes/paths.
 */
function diffPackages(
  source: LockPackage[],
  target: LockPackage[]
): PackageChange[] {
  const sourceByName = groupByName(source);
  const targetByName = groupByName(target);
  const names = new Set([...sourceByName.keys(), ...targetByName.keys()]);
  const changes: PackageChange[] = [];

  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const from = sourceByName.get(name) ?? [];
    const to = targetByName.get(name) ?? [];

    if (from.length === 0) {
      changes.push({
        name,
        type: PackageChangeTypes.Added,
        from: [],
        to,
      });
      continue;
    }
    if (to.length === 0) {
      changes.push({
        name,
        type: PackageChangeTypes.Removed,
        from,
        to: [],
      });
      continue;
    }

    if (scopesDiffer(from, to) && uniqueVersionsDiffer(from, to)) {
      changes.push({
        name,
        type: PackageChangeTypes.Changed,
        from,
        to,
      });
    }
  }

  return changes;
}

/**
 * Applies direct/optional flags onto one package-change list.
 */
function annotateList(
  changes: PackageChange[],
  options: {
    directNames: ReadonlySet<string>;
    optionalDeclaredNames: ReadonlySet<string>;
    before: Resolution;
    after: Resolution;
  },
  bucket: "dependencies" | "devDependencies"
): PackageChange[] {
  const lockPkgs = [
    ...options.before[bucket],
    ...options.after[bucket],
  ];
  return changes.map((change) => {
    const optionalFromLock = lockPkgs.some(
      (pkg) => pkg.name === change.name && pkg.optional === true
    );
    return {
      ...change,
      direct: options.directNames.has(change.name),
      optional:
        optionalFromLock || options.optionalDeclaredNames.has(change.name),
    };
  });
}

/**
 * Groups lock packages by name into sorted scoped version lists.
 */
function groupByName(packages: LockPackage[]): Map<string, ScopedVersion[]> {
  const grouped = new Map<string, ScopedVersion[]>();
  for (const pkg of packages) {
    const list = grouped.get(pkg.name) ?? [];
    list.push({ path: pkg.path, version: pkg.version });
    grouped.set(pkg.name, list);
  }
  for (const [name, list] of grouped) {
    list.sort((a, b) => a.path.localeCompare(b.path));
    grouped.set(name, list);
  }
  return grouped;
}

/**
 * Returns true when any scope path is missing on one side or has a different version.
 */
function scopesDiffer(from: ScopedVersion[], to: ScopedVersion[]): boolean {
  const fromMap = new Map(from.map((item) => [item.path, item.version]));
  const toMap = new Map(to.map((item) => [item.path, item.version]));
  const paths = new Set([...fromMap.keys(), ...toMap.keys()]);
  for (const path of paths) {
    if (fromMap.get(path) !== toMap.get(path)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the set of unique version tags differs between from and to.
 */
function uniqueVersionsDiffer(from: ScopedVersion[], to: ScopedVersion[]): boolean {
  const fromKey = [...new Set(from.map((item) => item.version))]
    .sort((a, b) => a.localeCompare(b))
    .join("\0");
  const toKey = [...new Set(to.map((item) => item.version))]
    .sort((a, b) => a.localeCompare(b))
    .join("\0");
  return fromKey !== toKey;
}

/**
 * Unique version tags from scoped installs, sorted and comma-separated for display.
 */
export function formatUniqueVersions(scoped: ScopedVersion[]): string {
  if (scoped.length === 0) {
    return "—";
  }
  return [...new Set(scoped.map((item) => item.version))]
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}
