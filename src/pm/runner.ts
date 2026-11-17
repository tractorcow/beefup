import { spawn } from "node:child_process";

import { getLogger } from "../log.js";

/** Captured stdout, stderr, and exit code from a child process. */
export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Controls whether a child process prints to the terminal while it runs. */
export interface RunOptions {
  /**
   * When true, inherit the terminal so the child prints as it runs.
   * Captured stdout and stderr are then empty.
   */
  stream?: boolean;
}

/** Abstraction for running package-manager or scanner binaries. */
export interface ProcessRunner {
  /**
   * Spawns a binary with args in cwd and returns captured output and exit code.
   * `options.stream` shows output on the terminal instead of capturing it.
   */
  run(
    bin: string,
    args: string[],
    cwd: string,
    options?: RunOptions
  ): Promise<RunResult>;
}

/**
 * Formats a failed command. Appends captured output when the child was not streamed.
 */
export function formatRunFailure(summary: string, result: RunResult): string {
  const output = (result.stderr || result.stdout).trim();
  if (output.length === 0) {
    return summary;
  }
  return `${summary}:\n${output}`;
}

/**
 * Default ProcessRunner that spawns a child process.
 * Output is captured unless `options.stream` inherits the terminal.
 */
export const defaultProcessRunner: ProcessRunner = {
  /**
   * Spawns a binary with args in cwd and returns captured output and exit code.
   * Streamed runs inherit stdout and stderr so package-manager progress stays visible.
   */
  async run(bin, args, cwd, options) {
    const log = getLogger();
    const rendered = [bin, ...args].join(" ");
    const stream = options?.stream === true;
    return log.timed(`running ${rendered}`, async () => {
      log.debug(`$ ${rendered} (cwd ${cwd})`);
      return new Promise<RunResult>((resolve, reject) => {
        const child = spawn(bin, args, {
          cwd,
          stdio: stream
            ? ["ignore", "inherit", "inherit"]
            : ["ignore", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        if (!stream && child.stdout && child.stderr) {
          child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
          child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
        }
        child.on("error", reject);
        child.on("close", (code) => {
          const result = {
            stdout: Buffer.concat(stdoutChunks).toString("utf8"),
            stderr: Buffer.concat(stderrChunks).toString("utf8"),
            code: code ?? 1,
          };
          log.debug(`${rendered} exited ${result.code}`);
          resolve(result);
        });
      });
    });
  },
};
