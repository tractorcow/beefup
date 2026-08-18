import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ProcessRunner {
  run(bin: string, args: string[], cwd: string): Promise<RunResult>;
}

export const defaultProcessRunner: ProcessRunner = {
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
