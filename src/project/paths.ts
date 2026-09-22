import path from "node:path";

/** Relative directory name under the package root for Beefup state. */
export const BEEFUP_DIR = ".beefup";

/** Snapshot directory names under `.beefup`. */
export const BeefupSnapshots = {
  Staged: "staged",
  Prior: "prior",
} as const;

/**
 * Returns the absolute path to the package's `.beefup` directory.
 */
export function beefupDir(packageRoot: string): string {
  return path.join(packageRoot, BEEFUP_DIR);
}

/**
 * Returns the absolute path to the staged proposal directory.
 */
export function stagedDir(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), BeefupSnapshots.Staged);
}

/**
 * Returns the absolute path to the prior-release snapshot directory.
 */
export function priorDir(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), BeefupSnapshots.Prior);
}

/**
 * Returns the absolute path to the upgrade report output directory.
 */
export function reportDir(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), "report");
}

/** File names written under `.beefup/report`. */
export const ReportFileNames = {
  Html: "REPORT.html",
  Markdown: "REPORT.md",
  Text: "REPORT.txt",
  Json: "report.json",
} as const;

/** Human-readable report files that `--format` may replace (not `report.json`). */
export const HumanReportFileNames = [
  ReportFileNames.Html,
  ReportFileNames.Markdown,
  ReportFileNames.Text,
] as const;

/**
 * Returns the absolute path to the git worktree working directory.
 */
export function worktreeDir(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), "work");
}

/**
 * Returns the absolute path to the inplace-strategy backup directory.
 */
export function backupDir(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), "backup");
}

/**
 * Returns the absolute path to the in-progress marker file.
 */
export function inProgressPath(packageRoot: string): string {
  return path.join(beefupDir(packageRoot), "IN_PROGRESS");
}
