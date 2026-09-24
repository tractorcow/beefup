import { readFile } from "node:fs/promises";

import { DefaultPackageRoot } from "../config/types.js";
import type {
  LockPackage,
  NpmLockfile,
  NpmLockfileDependency,
  Resolution,
} from "./types.js";

/** npm lockfile `packages` key prefix for a physical install. */
const NODE_MODULES_PREFIX = "node_modules/";

/**
 * Derives a package name from an npm `packages` key (including nested installs).
 */
function packageNameFromPackagesKey(key: string): string | null {
  if (key === "") {
    return null;
  }
  const marker = NODE_MODULES_PREFIX;
  const index = key.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  const name = key.slice(index + marker.length);
  return name.length > 0 ? name : null;
}

/**
 * Appends dependency entries from an npm lockfile `packages` map, including nested paths.
 */
function extractFromPackagesMap(
  deps: Record<string, NpmLockfileDependency>,
  dependencies: LockPackage[],
  devDependencies: LockPackage[]
): void {
  for (const [key, dep] of Object.entries(deps)) {
    if (!dep || !dep.version) {
      continue;
    }
    const packageName = packageNameFromPackagesKey(key);
    if (!packageName) {
      continue;
    }
    const info: LockPackage = {
      name: packageName,
      version: dep.version,
      path: key,
    };
    if (dep.optional === true) {
      info.optional = true;
    }
    if (dep.dev === true) {
      devDependencies.push(info);
      continue;
    }
    dependencies.push(info);
  }
}

/**
 * Recursively walks a lockfileVersion 1 dependency tree, recording each install path.
 */
function extractVersion1Tree(
  deps: Record<string, NpmLockfileDependency>,
  dependencies: LockPackage[],
  devDependencies: LockPackage[],
  parentPath: string,
  forceDev: boolean
): void {
  for (const [name, dep] of Object.entries(deps)) {
    if (!dep || !dep.version) {
      continue;
    }
    const installPath = parentPath
      ? `${parentPath}/node_modules/${name}`
      : `node_modules/${name}`;
    const info: LockPackage = {
      name,
      version: dep.version,
      path: installPath,
    };
    if (dep.optional === true) {
      info.optional = true;
    }
    if (forceDev || dep.dev === true) {
      devDependencies.push(info);
    } else {
      dependencies.push(info);
    }
    if (dep.dependencies) {
      extractVersion1Tree(
        dep.dependencies,
        dependencies,
        devDependencies,
        installPath,
        forceDev || dep.dev === true
      );
    }
  }
}

/**
 * Builds a Resolution from an npm lockfileVersion 1 `dependencies` layout.
 */
function resolveVersion1(lockfile: NpmLockfile): Resolution {
  const dependencies: LockPackage[] = [];
  const devDependencies: LockPackage[] = [];
  if (lockfile.dependencies) {
    extractVersion1Tree(
      lockfile.dependencies,
      dependencies,
      devDependencies,
      "",
      false
    );
  }
  if (lockfile.devDependencies) {
    extractVersion1Tree(
      lockfile.devDependencies,
      dependencies,
      devDependencies,
      "",
      true
    );
  }
  return { dependencies, devDependencies };
}

/**
 * Builds a Resolution from an npm lockfileVersion 2/3 `packages` layout.
 */
function resolveVersion2Or3(lockfile: NpmLockfile): Resolution {
  const dependencies: LockPackage[] = [];
  const devDependencies: LockPackage[] = [];
  if (lockfile.packages) {
    extractFromPackagesMap(lockfile.packages, dependencies, devDependencies);
  }
  return { dependencies, devDependencies };
}

/**
 * Parses package-lock.json content into a typed lockfile object.
 * Throws when the JSON is invalid.
 */
export function parseNpmLockfile(content: string): NpmLockfile {
  try {
    return JSON.parse(content) as NpmLockfile;
  } catch (error) {
    throw new Error(
      `Failed to parse package-lock.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Reads and resolves an npm lockfile on disk into dependency and devDependency lists.
 * Includes nested installs with their install paths as scopes.
 */
export async function resolveNpmLockfile(filePath: string): Promise<Resolution> {
  const parsed = parseNpmLockfile(await readFile(filePath, "utf8"));
  const lockfileVersion = parsed.lockfileVersion ?? 1;
  switch (lockfileVersion) {
    case 1:
      return resolveVersion1(parsed);
    case 2:
    case 3:
      return resolveVersion2Or3(parsed);
    default:
      throw new Error(
        `Unsupported lockfileVersion: ${lockfileVersion}. Only versions 1, 2, and 3 are supported.`
      );
  }
}

/**
 * Returns true when `importerDir` is the workspace root (`""` or `.`).
 */
function isRootImporter(importerDir: string): boolean {
  return importerDir === DefaultPackageRoot || importerDir === "";
}

/**
 * Ancestor importer dirs from workspace root down to `importerDir`.
 * Nested installs overlay hoisted ones when collecting locked versions.
 */
function npmImporterAncestry(importerDir: string): string[] {
  const dir = importerDir.replace(/\\/g, "/");
  if (isRootImporter(dir)) {
    return [DefaultPackageRoot];
  }
  const parts = dir.split("/").filter(Boolean);
  const dirs: string[] = [DefaultPackageRoot];
  for (let i = 0; i < parts.length; i++) {
    dirs.push(parts.slice(0, i + 1).join("/"));
  }
  return dirs;
}

/**
 * npm lockfile `packages` key prefix for installs under an importer directory.
 */
function npmNodeModulesPrefix(importerDir: string): string {
  if (isRootImporter(importerDir)) {
    return NODE_MODULES_PREFIX;
  }
  return `${importerDir.replace(/\\/g, "/")}/${NODE_MODULES_PREFIX}`;
}

/**
 * Resolves a lockfile `packages` entry to a concrete version, following workspace links.
 */
function npmLockedVersion(
  packages: Record<string, NpmLockfileDependency>,
  meta: NpmLockfileDependency | undefined
): string | undefined {
  if (!meta) {
    return undefined;
  }
  if (meta.version) {
    return meta.version;
  }
  if (meta.link === true && typeof meta.resolved === "string") {
    return packages[meta.resolved]?.version;
  }
  return undefined;
}

/**
 * Maps package names to locked versions for one npm importer path.
 * Walks from the workspace root so hoisted installs are visible to nested
 * workspaces; a nested `node_modules` entry overlays a hoisted one.
 */
export function lockedVersionsFromNpm(
  lockfile: NpmLockfile,
  importerDir: string
): Map<string, string> {
  const locked = new Map<string, string>();
  const packages = lockfile.packages ?? {};
  for (const dir of npmImporterAncestry(importerDir)) {
    const prefix = npmNodeModulesPrefix(dir);
    for (const [key, meta] of Object.entries(packages)) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const rest = key.slice(prefix.length);
      if (rest.includes(`/${NODE_MODULES_PREFIX}`)) {
        continue;
      }
      const version = npmLockedVersion(packages, meta);
      if (version) {
        locked.set(rest, version);
      }
    }
  }
  return locked;
}
