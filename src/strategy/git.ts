import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { BEEFUP_DIR } from "../project/paths.js";

const execFile = promisify(execFileCallback);

/** Git porcelain v1 separator between rename/copy source and destination. */
const PorcelainRenameSeparator = " -> ";

/**
 * Runs a git command in cwd and returns trimmed stdout/stderr.
 */
export async function runGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFile("git", args, {
    cwd,
    encoding: "utf8",
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * Returns whether cwd is inside a git working tree.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when `git status --porcelain` lists any path outside `.beefup`.
 * Beefup's own staged/report artefacts must not block a worktree re-stage.
 */
export function hasNonBeefupWorkingTreeChanges(porcelain: string): boolean {
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) {
      continue;
    }
    for (const raw of splitPorcelainPaths(line.slice(3))) {
      const normalized = normalizePorcelainPath(raw);
      if (normalized.length > 0 && !isBeefupStatusPath(normalized)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Splits a porcelain path field into one path, or source and destination for renames.
 */
function splitPorcelainPaths(pathPart: string): string[] {
  let inQuotes = false;
  let escaped = false;
  for (let i = 0; i < pathPart.length; i += 1) {
    const ch = pathPart[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inQuotes && ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && pathPart.startsWith(PorcelainRenameSeparator, i)) {
      return [
        pathPart.slice(0, i),
        pathPart.slice(i + PorcelainRenameSeparator.length),
      ];
    }
  }
  return [pathPart];
}

/**
 * Unquotes a git C-style porcelain path and normalizes slashes and trailing slashes.
 */
function normalizePorcelainPath(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

/**
 * Returns true when a normalized porcelain path is `.beefup` or a file under it.
 */
function isBeefupStatusPath(normalized: string): boolean {
  return (
    normalized === BEEFUP_DIR || normalized.startsWith(`${BEEFUP_DIR}/`)
  );
}
