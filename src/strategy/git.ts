import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";

import { DefaultPackageRoot } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { formatBytes, formatDuration, getLogger } from "../log.js";
import { BEEFUP_DIR } from "../project/paths.js";

const execFile = promisify(execFileCallback);

/** Git's generic failure exit status (missing path, invalid object, and similar). */
const GitFailureExitCode = 128;

/** Git executable Beefup invokes. */
export const GitBins = {
  Git: "git",
} as const;

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
  ShowToplevel: "--show-toplevel",
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
  const log = getLogger();
  const started = performance.now();
  const rendered = `${GitBins.Git} ${args.join(" ")}`;
  log.debug(`$ ${rendered} (cwd ${cwd})`);
  try {
    const { stdout, stderr } = await execFile(GitBins.Git, args, {
      cwd,
      encoding: "utf8",
    });
    log.debug(
      `${rendered} exited 0 in ${formatDuration(performance.now() - started)}`
    );
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    log.debug(
      `${rendered} failed in ${formatDuration(performance.now() - started)}`
    );
    throw error;
  }
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
 * Returns the git working-tree root, or undefined when cwd is not in a repo.
 */
export async function gitToplevel(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await runGit(
      [GitSubcommands.RevParse, GitFlags.ShowToplevel],
      cwd
    );
    return stdout.length > 0 ? stdout : undefined;
  } catch {
    return undefined;
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
async function spawnGit(
  args: string[],
  cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const log = getLogger();
  const started = performance.now();
  const rendered = `${GitBins.Git} ${args.join(" ")}`;
  log.debug(`$ ${rendered} (cwd ${cwd})`);
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(GitBins.Git, args, { cwd });
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
  const duration = formatDuration(performance.now() - started);
  if (result.code === 0) {
    log.debug(
      `${rendered} exited 0 in ${duration} (${formatBytes(Buffer.byteLength(result.stdout))})`
    );
  } else {
    log.debug(`${rendered} exited ${result.code} in ${duration}`);
  }
  return result;
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
 * Returns true when `git status --porcelain` lists a dirty path that should
 * block worktree staging. Nested `.beefup` directories are ignored. When
 * `packageRelative` is a nested package, sibling paths are ignored too.
 */
export function hasNonBeefupWorkingTreeChanges(
  porcelain: string,
  packageRelative: string = DefaultPackageRoot
): boolean {
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) {
      continue;
    }
    for (const raw of splitPorcelainPaths(line.slice(3))) {
      const normalized = normalizePorcelainPath(raw);
      if (
        normalized.length > 0 &&
        isPathInPackage(normalized, packageRelative) &&
        !isBeefupStatusPath(normalized)
      ) {
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
 * Returns true when a normalized porcelain path is `.beefup` or a nested `.beefup`.
 */
function isBeefupStatusPath(normalized: string): boolean {
  return (
    normalized === BEEFUP_DIR ||
    normalized.startsWith(`${BEEFUP_DIR}/`) ||
    normalized.endsWith(`/${BEEFUP_DIR}`) ||
    normalized.includes(`/${BEEFUP_DIR}/`)
  );
}

/**
 * Returns true when a git-status path is inside the package being staged.
 */
function isPathInPackage(
  normalized: string,
  packageRelative: string
): boolean {
  if (packageRelative === DefaultPackageRoot) {
    return true;
  }
  return (
    normalized === packageRelative ||
    normalized.startsWith(`${packageRelative}/`)
  );
}
