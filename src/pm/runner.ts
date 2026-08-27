import { spawn } from "node:child_process";

/** Captured stdout, stderr, and exit code from a child process. */
export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Abstraction for running package-manager or scanner binaries. */
export interface ProcessRunner {
  /**
   * Spawns a binary with args in cwd and returns captured output and exit code.
   */
  run(bin: string, args: string[], cwd: string): Promise<RunResult>;
}

/**
 * Default ProcessRunner that spawns a child process and collects stdout/stderr.
 */
export const defaultProcessRunner: ProcessRunner = {
  /**
   * Spawns a binary with args in cwd and returns captured output and exit code.
   */
  async run(bin, args, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          code: code ?? 1,
        });
      });
    });
  },
};
