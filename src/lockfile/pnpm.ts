import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type {
  LockPackage,
  PnpmImporterDep,
  PnpmLockfile,
  Resolution,
} from "./types.js";

/**
 * Normalizes a pnpm package key, dropping nested node_modules paths.
 */
function cleanPackageKey(key: string): string | null {
  const parts = key.split("/");
  const nodeModulesIndex = parts.indexOf("node_modules");
  if (nodeModulesIndex !== -1) {
    const nodeModulesCount = parts.filter((part) => part === "node_modules").length;
    if (nodeModulesCount !== 1) {
      return null;
    }
    return parts.slice(nodeModulesIndex + 1).join("/");
  }
  return key;
}

/**
 * Parses a pnpm packages-map key into package name and optional embedded version.
 */
function extractPackageInfoFromName(
  key: string
): { name: string; version: string | null } | null {
  const packageKey = cleanPackageKey(key);
  if (!packageKey) {
    return null;
  }
  let working = packageKey;
  if (working.startsWith("/")) {
    working = working.slice(1);
  }
  const paren = working.indexOf("(");
  if (paren !== -1) {
    working = working.slice(0, paren);
  }
  if (working.startsWith("@")) {
    const lastAtIndex = working.lastIndexOf("@");
    if (lastAtIndex <= 0) {
      return { name: working, version: null };
    }
    return {
      name: working.slice(0, lastAtIndex),
      version: working.slice(lastAtIndex + 1),
    };
  }
  const at = working.lastIndexOf("@");
  if (at <= 0) {
    return { name: working, version: null };
  }
  return {
    name: working.slice(0, at),
    version: working.slice(at + 1),
  };
}

/**
 * Parses pnpm-lock.yaml content into a typed lockfile object.
 * Throws when the YAML is not a valid object.
 */
export function parsePnpmLockfile(content: string): PnpmLockfile {
  try {
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Parsed YAML is not an object");
    }
    return parsed as PnpmLockfile;
  } catch (error) {
    throw new Error(
      `Failed to parse pnpm-lock.yaml: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Reads and resolves a pnpm lockfile on disk into dependency and devDependency lists.
 * Each packages-map entry is a scoped install keyed by its lockfile path.
 */
export async function resolvePnpmLockfile(filePath: string): Promise<Resolution> {
  const lockfile = parsePnpmLockfile(await readFile(filePath, "utf8"));
  const dependencies: LockPackage[] = [];
  const devDependencies: LockPackage[] = [];

  if (lockfile.packages) {
    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      if (!pkg || typeof pkg !== "object") {
        continue;
      }
      const nameAndVersion = extractPackageInfoFromName(key);
      if (!nameAndVersion) {
        continue;
      }
      const version =
        typeof pkg.version === "string" ? pkg.version : nameAndVersion.version;
      if (!version) {
        continue;
      }
      const info: LockPackage = {
        name: nameAndVersion.name,
        version,
        path: key,
      };
      if (pkg.optional === true) {
        info.optional = true;
      }
      if (pkg.dev === true) {
        devDependencies.push(info);
        continue;
      }
      dependencies.push(info);
    }
  }

  return { dependencies, devDependencies };
}

/**
 * Removes the peer-dependency suffix (parenthetical) from a pnpm version string.
 */
export function stripPnpmPeerSuffix(value: string): string {
  const paren = value.indexOf("(");
  return paren === -1 ? value : value.slice(0, paren);
}

/**
 * Extracts a concrete version from a pnpm importer dependency entry.
 */
function importerVersion(value: PnpmImporterDep | string | undefined): string | undefined {
  if (typeof value === "string") {
    return stripPnpmPeerSuffix(value);
  }
  if (value && typeof value.version === "string") {
    return stripPnpmPeerSuffix(value.version);
  }
  return undefined;
}

/**
 * Maps direct dependency names to locked versions for one pnpm importer path.
 */
export function lockedVersionsFromPnpm(
  lockfile: PnpmLockfile,
  importerDir: string
): Map<string, string> {
  const locked = new Map<string, string>();
  const key = importerDir === "." ? "." : importerDir.replace(/\\/g, "/");
  const importer = lockfile.importers?.[key];
  if (!importer) {
    return locked;
  }
  const buckets = [
    importer.dependencies,
    importer.devDependencies,
    importer.optionalDependencies,
  ];
  for (const bucket of buckets) {
    if (!bucket) {
      continue;
    }
    for (const [name, info] of Object.entries(bucket)) {
      const version = importerVersion(info);
      if (version && !version.startsWith("link:") && !version.startsWith("file:")) {
        locked.set(name, version);
      }
    }
  }
  return locked;
}

export { extractPackageInfoFromName };
