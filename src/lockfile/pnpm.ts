import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type {
  LockPackage,
  PnpmImporterDep,
  PnpmLockfile,
  Resolution,
} from "./types.js";

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

export async function resolvePnpmLockfile(filePath: string): Promise<Resolution> {
  const lockfile = parsePnpmLockfile(await readFile(filePath, "utf8"));
  const dependencies: LockPackage[] = [];
  const devDependencies: LockPackage[] = [];

  if (lockfile.packages) {
    for (const [name, pkg] of Object.entries(lockfile.packages)) {
      if (!pkg || typeof pkg !== "object") {
        continue;
      }
      const nameAndVersion = extractPackageInfoFromName(name);
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
      };
      if (pkg.dev === true) {
        devDependencies.push(info);
        continue;
      }
      dependencies.push(info);
    }
  }

  return { dependencies, devDependencies };
}

export function stripPnpmPeerSuffix(value: string): string {
  const paren = value.indexOf("(");
  return paren === -1 ? value : value.slice(0, paren);
}

function importerVersion(value: PnpmImporterDep | string | undefined): string | undefined {
  if (typeof value === "string") {
    return stripPnpmPeerSuffix(value);
  }
  if (value && typeof value.version === "string") {
    return stripPnpmPeerSuffix(value.version);
  }
  return undefined;
}

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
