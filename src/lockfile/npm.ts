import { readFile } from "node:fs/promises";

import type {
  LockPackage,
  NpmLockfile,
  NpmLockfileDependency,
  Resolution,
} from "./types.js";

/**
 * Derives a package name from an npm lockfile packages key, or null for nested installs.
 */
function extractPackageName(key: string): string | null {
  if (key === "") {
    return null;
  }
  const parts = key.split("/");
  const nodeModulesIndex = parts.indexOf("node_modules");
  if (nodeModulesIndex === -1) {
    return key;
  }
  const nodeModulesCount = parts.filter((part) => part === "node_modules").length;
  if (nodeModulesCount !== 1) {
    return null;
  }
  return parts.slice(nodeModulesIndex + 1).join("/");
}

/**
 * Appends dependency entries from an npm lockfile map into dependency/devDependency lists.
 */
function extractDependencies(
  deps: Record<string, NpmLockfileDependency>,
  dependencies: LockPackage[],
  devDependencies: LockPackage[],
  forceDev = false
): void {
  for (const [key, dep] of Object.entries(deps)) {
    if (!dep || !dep.version) {
      continue;
    }
    const packageName = extractPackageName(key);
    if (!packageName) {
      continue;
    }
    const info: LockPackage = { name: packageName, version: dep.version };
    if (forceDev || dep.dev === true) {
      devDependencies.push(info);
      continue;
    }
    dependencies.push(info);
  }
}

/**
 * Builds a Resolution from an npm lockfileVersion 1 `dependencies` layout.
 */
function resolveVersion1(lockfile: NpmLockfile): Resolution {
  const dependencies: LockPackage[] = [];
  const devDependencies: LockPackage[] = [];
  if (lockfile.dependencies) {
    extractDependencies(lockfile.dependencies, dependencies, devDependencies, false);
  }
  if (lockfile.devDependencies) {
    extractDependencies(
      lockfile.devDependencies,
      dependencies,
      devDependencies,
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
    extractDependencies(lockfile.packages, dependencies, devDependencies, false);
  }
  if (lockfile.dependencies) {
    extractDependencies(lockfile.dependencies, dependencies, devDependencies, false);
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
 * Maps direct (non-nested) package names to locked versions for one npm importer path.
 */
export function lockedVersionsFromNpm(
  lockfile: NpmLockfile,
  importerDir: string
): Map<string, string> {
  const locked = new Map<string, string>();
  const packages = lockfile.packages ?? {};
  const prefix =
    importerDir === "." || importerDir === ""
      ? "node_modules/"
      : `${importerDir.replace(/\\/g, "/")}/node_modules/`;

  for (const [key, meta] of Object.entries(packages)) {
    if (!meta?.version) {
      continue;
    }
    if (!key.startsWith(prefix)) {
      continue;
    }
    const rest = key.slice(prefix.length);
    if (rest.includes("/node_modules/")) {
      continue;
    }
    locked.set(rest, meta.version);
  }
  return locked;
}
