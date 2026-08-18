import path from "node:path";

export const BEEFUP_DIR = ".beefup";

export function beefupDir(projectRoot: string): string {
  return path.join(projectRoot, BEEFUP_DIR);
}

export function stagedDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "staged");
}

export function worktreeDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "work");
}

export function backupDir(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "backup");
}

export function inProgressPath(projectRoot: string): string {
  return path.join(beefupDir(projectRoot), "IN_PROGRESS");
}
