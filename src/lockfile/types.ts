export interface LockPackage {
  name: string;
  version: string;
  /** Install / lockfile scope used for path-for-path comparison. */
  path: string;
  /** True when the lockfile marks this install as optional. */
  optional?: boolean;
}

export interface Resolution {
  dependencies: LockPackage[];
  devDependencies: LockPackage[];
}

export interface NpmLockfileDependency {
  version?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, NpmLockfileDependency>;
}

export interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfileDependency>;
  dependencies?: Record<string, NpmLockfileDependency>;
  devDependencies?: Record<string, NpmLockfileDependency>;
}

export interface PnpmLockfilePackage {
  version?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PnpmImporterDep {
  specifier?: string;
  version?: string;
}

export interface PnpmImporter {
  dependencies?: Record<string, PnpmImporterDep | string>;
  devDependencies?: Record<string, PnpmImporterDep | string>;
  optionalDependencies?: Record<string, PnpmImporterDep | string>;
  peerDependencies?: Record<string, PnpmImporterDep | string>;
}

export interface PnpmLockfile {
  lockfileVersion?: string | number;
  importers?: Record<string, PnpmImporter>;
  packages?: Record<string, PnpmLockfilePackage>;
  snapshots?: Record<string, PnpmLockfilePackage>;
}
