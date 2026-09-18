import path from "node:path";

import { CliOptionFlags, DefaultPackageRoot } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import { reportDir, ReportFileNames } from "./paths.js";

export interface ResolvedPackageRoot {
  /** Absolute directory that contains package.json and the lockfile. */
  absolute: string;
  /** POSIX path relative to the project root; `.` when they are the same. */
  relative: string;
}

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
 * Resolves the package root from a CLI argument, or the last report if omitted.
 */
export async function resolveCommandPackageRoot(
  projectRoot: string,
  packageRootArg?: string
): Promise<ResolvedPackageRoot> {
  const fromReport =
    packageRootArg === undefined
      ? await readPreviousPackageRoot(projectRoot)
      : undefined;
  return resolvePackageRoot(projectRoot, packageRootArg ?? fromReport);
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

/**
 * Reads a stored package-root relative path from the last report.json, if any.
 */
async function readPreviousPackageRoot(
  projectRoot: string
): Promise<string | undefined> {
  const reportPath = path.join(reportDir(projectRoot), ReportFileNames.Json);
  if (!(await pathExists(reportPath))) {
    return undefined;
  }
  try {
    const parsed = await readJsonFile<{ packageRoot?: unknown }>(reportPath);
    return typeof parsed.packageRoot === "string" ? parsed.packageRoot : undefined;
  } catch {
    return undefined;
  }
}
