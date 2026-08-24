import path from "node:path";

/** Relative directory name under the project root for Beefup state. */
export const BEEFUP_DIR = ".beefup";

/**
 * Returns the absolute path to the project's `.beefup` directory.
 */
export function beefupDir(projectRoot: string): string {
  return path.join(projectRoot, BEEFUP_DIR);
}

/**
 * Returns the absolute path to the staged proposal directory.
 */
export function stagedDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "staged");
}

/**
 * Returns the absolute path to the upgrade report output directory.
 */
export function reportDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "report");
}

/** File names written under `.beefup/report`. */
export const ReportFileNames = {
  Html: "REPORT.html",
  Json: "report.json",
} as const;

/**
 * Returns the absolute path to the git worktree working directory.
 */
export function worktreeDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "work");
}

/**
 * Returns the absolute path to the inplace-strategy backup directory.
 */
export function backupDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "backup");
}

/**
 * Returns the absolute path to the in-progress marker file.
 */
export function inProgressPath(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "IN_PROGRESS");
}
