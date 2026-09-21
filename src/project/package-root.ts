import { glob } from "node:fs/promises";
import path from "node:path";

import { loadConfigFromDir } from "../config/load.js";
import {
  BeefupConfigFileName,
  CliOptionFlags,
  DefaultPackageRoot,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { LockfileNames } from "./types.js";

export interface ResolvedPackageRoot {
  /** Absolute directory that contains package.json and the lockfile. */
  absolute: string;
  /** POSIX path relative to the project root; `.` when they are the same. */
  relative: string;
}

export interface ResolvedCommandRoots {
  /** Git / config directory used as `--dir` for git operations. */
  projectRoot: string;
  /** Package roots this command should run against. */
  packageRoots: ResolvedPackageRoot[];
}

/** Characters that mark a package-root value as a glob pattern. */
const PackageRootGlobPattern = /[*?[]/;

/**
 * Resolves the directory that holds package.json and the lockfile.
 * `--package-root` is relative to the project root (or absolute) and must stay inside it.
 */
export function resolvePackageRoot(
  projectRoot: string,
  packageRootArg?: string
): ResolvedPackageRoot {
  const root = path.resolve(projectRoot);
  const absolute = path.resolve(root, packageRootArg ?? DefaultPackageRoot);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new BeefupError(
      `${CliOptionFlags.PackageRoot} must be inside the project directory`
    );
  }
  const relative = rel === "" ? DefaultPackageRoot : rel.replaceAll("\\", "/");
  return { absolute, relative };
}

/**
 * Resolves the single package root for a command from an explicit relative path.
 */
export function resolveCommandPackageRoot(
  projectRoot: string,
  packageRootArg?: string
): ResolvedPackageRoot {
  return resolvePackageRoot(projectRoot, packageRootArg);
}

/**
 * Resolves which package roots a CLI command should run, from flags and repo config.
 */
export async function resolveCommandPackageRoots(options: {
  startDir: string;
  cliPackageRoots?: string[];
  gitRoot?: string;
}): Promise<ResolvedCommandRoots> {
  const startDir = path.resolve(options.startDir);
  const configDir = await resolveConfigDir(startDir, options.gitRoot);
  const repoConfig = await loadConfigFromDir(configDir);

  if (options.cliPackageRoots && options.cliPackageRoots.length > 0) {
    return {
      projectRoot: startDir,
      packageRoots: await expandPackageRootPatterns(
        startDir,
        options.cliPackageRoots
      ),
    };
  }

  if (repoConfig.packageRoot !== undefined) {
    const packageRoots = await expandPackageRootPatterns(
      configDir,
      asPackageRootList(repoConfig.packageRoot)
    );
    return {
      projectRoot: configDir,
      packageRoots: selectPackageRootsForStartDir(
        configDir,
        startDir,
        packageRoots
      ),
    };
  }

  return {
    projectRoot: startDir,
    packageRoots: [resolvePackageRoot(startDir, DefaultPackageRoot)],
  };
}

/**
 * When the user is inside a nested configured package, run only that root.
 * At the config/git root, run the full list even if `"."` is a listed root.
 */
function selectPackageRootsForStartDir(
  configDir: string,
  startDir: string,
  packageRoots: ResolvedPackageRoot[]
): ResolvedPackageRoot[] {
  if (path.resolve(startDir) === path.resolve(configDir)) {
    return packageRoots;
  }
  const matching = packageRoots.filter(
    (root) => path.resolve(root.absolute) === startDir
  );
  return matching.length > 0 ? matching : packageRoots;
}

/**
 * Chooses the directory that holds repo-level Beefup config.
 */
async function resolveConfigDir(
  startDir: string,
  gitRoot?: string
): Promise<string> {
  if (await pathExists(path.join(startDir, BeefupConfigFileName))) {
    return startDir;
  }
  if (gitRoot) {
    return path.resolve(gitRoot);
  }
  return startDir;
}

/**
 * Normalizes a config `packageRoot` field to a list of patterns.
 */
export function asPackageRootList(
  packageRoot: string | string[]
): string[] {
  return typeof packageRoot === "string" ? [packageRoot] : packageRoot;
}

/**
 * Expands literal paths and globs into package directories that have a lockfile.
 */
export async function expandPackageRootPatterns(
  projectRoot: string,
  patterns: string[]
): Promise<ResolvedPackageRoot[]> {
  const seen = new Set<string>();
  const roots: ResolvedPackageRoot[] = [];
  for (const pattern of patterns) {
    for (const root of await expandPackageRootPattern(projectRoot, pattern)) {
      if (seen.has(root.relative)) {
        continue;
      }
      seen.add(root.relative);
      roots.push(root);
    }
  }
  return roots;
}

/**
 * Expands one package-root path or glob relative to `projectRoot`.
 */
async function expandPackageRootPattern(
  projectRoot: string,
  pattern: string
): Promise<ResolvedPackageRoot[]> {
  const normalized = pattern.replaceAll("\\", "/");
  if (!PackageRootGlobPattern.test(normalized)) {
    const resolved = resolvePackageRoot(projectRoot, normalized);
    await assertPackageRootOnDisk(resolved);
    return [resolved];
  }

  const globPattern = path.posix.join(
    normalized.replace(/\/$/, ""),
    "package.json"
  );
  const matches: ResolvedPackageRoot[] = [];
  for await (const match of glob(globPattern, { cwd: projectRoot })) {
    const relDir = path.posix.dirname(match.replaceAll("\\", "/"));
    const resolved = resolvePackageRoot(
      projectRoot,
      relDir === DefaultPackageRoot ? DefaultPackageRoot : relDir
    );
    if (await hasLockfile(resolved.absolute)) {
      matches.push(resolved);
    }
  }
  if (matches.length === 0) {
    throw new BeefupError(
      `${CliOptionFlags.PackageRoot} glob ${pattern} matched no package roots with a lockfile`
    );
  }
  return matches;
}

/**
 * Fails when a literal package root is missing package.json or a lockfile.
 */
async function assertPackageRootOnDisk(
  resolved: ResolvedPackageRoot
): Promise<void> {
  if (!(await pathExists(path.join(resolved.absolute, "package.json")))) {
    throw new BeefupError(`no package.json at ${resolved.absolute}`);
  }
  if (!(await hasLockfile(resolved.absolute))) {
    throw new BeefupError(
      `no ${LockfileNames.Pnpm} or ${LockfileNames.Npm} at ${resolved.absolute}`
    );
  }
}

/**
 * Returns true when `dir` contains an npm or pnpm lockfile.
 */
async function hasLockfile(dir: string): Promise<boolean> {
  return (
    (await pathExists(path.join(dir, LockfileNames.Pnpm))) ||
    (await pathExists(path.join(dir, LockfileNames.Npm)))
  );
}

/**
 * Maps a package-relative file path to the git path from the project root.
 */
export function gitPathFromPackageRelative(
  packageRelative: string,
  fileRelative: string
): string {
  const file = fileRelative.replaceAll("\\", "/");
  if (packageRelative === DefaultPackageRoot) {
    return file;
  }
  return path.posix.join(packageRelative, file);
}

/**
 * Strips the package-root prefix from a git tree path, or undefined if outside it.
 */
export function packageRelativeFromGitPath(
  packageRelative: string,
  gitPath: string
): string | undefined {
  const normalized = gitPath.replaceAll("\\", "/");
  if (packageRelative === DefaultPackageRoot) {
    return normalized;
  }
  if (normalized === packageRelative) {
    return undefined;
  }
  const prefix = `${packageRelative}/`;
  if (!normalized.startsWith(prefix)) {
    return undefined;
  }
  return normalized.slice(prefix.length);
}