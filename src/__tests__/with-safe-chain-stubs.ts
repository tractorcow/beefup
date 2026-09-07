import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Puts stub `aikido-pnpm` / `aikido-npm` binaries on PATH for the duration of `fn`.
 * Production code only needs `which` to succeed; ProcessRunner mocks handle execution.
 */
export async function withSafeChainStubs<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-sc-stub-"));
  const previous = process.env.PATH;
  try {
    for (const name of ["aikido-pnpm", "aikido-npm", "safe-chain"] as const) {
      const stub = path.join(dir, name);
      await writeFile(stub, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(stub, 0o755);
    }
    process.env.PATH = `${dir}${path.delimiter}${previous ?? ""}`;
    return await fn();
  } finally {
    process.env.PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
