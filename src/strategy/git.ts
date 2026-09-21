import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";

import { BeefupError } from "../errors.js";
import { BEEFUP_DIR } from "../project/paths.js";

const execFile = promisify(execFileCallback);

/** Git's generic failure exit status (missing path, invalid object, and similar). */
const GitFailureExitCode = 128;

/** Git subcommands Beefup invokes. */
export const GitSubcommands = {
  LsTree: "ls-tree",
  RevParse: "rev-parse",
  Show: "show",
  Status: "status",
  Worktree: "worktree",
} as const;

/** Git flags used with rev-parse, status, ls-tree, and worktree. */
export const GitFlags = {
  Verify: "--verify",
  IsInsideWorkTree: "--is-inside-work-tree",
  Porcelain: "--porcelain",
  Recurse: "-r",
  NameOnly: "--name-only",
  Detach: "--detach",
  Force: "--force",
} as const;

/** Git worktree subcommand actions. */
export const GitWorktreeActions = {
  Add: "add",
  Remove: "remove",
  Prune: "prune",
} as const;

/** Git revisions Beefup checks out for staging. */
export const GitRefs = {
  Head: "HEAD",
} as const;

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
    await runGit(
      [GitSubcommands.RevParse, GitFlags.IsInsideWorkTree],
      cwd
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves `ref` to a commit id, or throws when the revision does not exist.
 */
export async function resolveGitRef(ref: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await runGit(
      [GitSubcommands.RevParse, GitFlags.Verify, `${ref}^{commit}`],
      cwd
    );
    return stdout;
  } catch {
    throw new BeefupError(`invalid git ref: ${ref}`);
  }
}

/**
 * Returns the contents of `ref:path` via `git show`, or undefined when missing.
 * Does not trim, so lockfile/manifest bytes stay intact. Collects stdout without
 * Node's 1MiB execFile cap, which otherwise treats large lockfiles as missing.
 */
export async function gitShowFile(
  ref: string,
  relPath: string,
  cwd: string
): Promise<string | undefined> {
  const spec = `${ref}:${relPath.replaceAll("\\", "/")}`;
  const { code, stdout, stderr } = await spawnGit(
    [GitSubcommands.Show, spec],
    cwd
  );
  if (code === 0) {
    return stdout;
  }
  if (isGitMissingPathError(code, stderr)) {
    return undefined;
  }
  throw new BeefupError(
    `failed to read ${spec} from git: ${stderr.trim() || `exit ${code}`}`
  );
}

/**
 * Runs git and collects full stdout/stderr with no maxBuffer limit.
 */
function spawnGit(
  args: string[],
  cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

/**
 * Returns true when git failed because `ref:path` is not in the tree.
 */
function isGitMissingPathError(code: number | null, stderr: string): boolean {
  if (code !== GitFailureExitCode) {
    return false;
  }
  return (
    stderr.includes("does not exist in") ||
    stderr.includes("exists on disk, but not in")
  );
}

/**
 * Lists every path in the tree at `ref` (`git ls-tree -r --name-only`).
 */
export async function listGitTreePaths(ref: string, cwd: string): Promise<string[]> {
  const { stdout } = await runGit(
    [GitSubcommands.LsTree, GitFlags.Recurse, GitFlags.NameOnly, ref],
    cwd
  );
  if (stdout.length === 0) {
    return [];
  }
  return stdout.split("\n");
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
