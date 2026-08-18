import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

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

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}
