import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { aikidoBinName, SafeChainBins } from "../pm/safe-chain.js";
import { PackageManagers } from "../project/types.js";

const execFile = promisify(execFileCallback);

/**
 * Puts stub executables on PATH (prepended) for the duration of `fn`.
 */
export async function withPathStubs<T>(
  names: readonly string[],
  fn: () => Promise<T>
): Promise<T> {
  return withStubbedPath(names, false, fn);
}

/**
 * Puts stub executables on an isolated PATH so only those names (plus `which`) resolve.
 */
export async function withIsolatedPathStubs<T>(
  names: readonly string[],
  fn: () => Promise<T>
): Promise<T> {
  return withStubbedPath(names, true, fn);
}

/**
 * Puts stub `aikido-pnpm` / `aikido-npm` / `safe-chain` binaries on PATH for `fn`.
 * Production code only needs `which` to succeed; ProcessRunner mocks handle execution.
 */
export async function withSafeChainStubs<T>(fn: () => Promise<T>): Promise<T> {
  return withPathStubs(
    [
      aikidoBinName(PackageManagers.Pnpm),
      aikidoBinName(PackageManagers.Npm),
      SafeChainBins.Wrapper,
    ],
    fn
  );
}

/**
 * Writes stub binaries into a temp dir and points PATH at it for the duration of `fn`.
 */
async function withStubbedPath<T>(
  names: readonly string[],
  isolated: boolean,
  fn: () => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-bin-stub-"));
  const previous = process.env.PATH;
  try {
    for (const name of names) {
      const stub = path.join(dir, name);
      await writeFile(stub, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(stub, 0o755);
    }
    if (isolated) {
      const { stdout } = await execFile("which", ["which"], { encoding: "utf8" });
      const whichDir = path.dirname(stdout.trim());
      process.env.PATH = `${dir}${path.delimiter}${whichDir}`;
    } else {
      process.env.PATH = `${dir}${path.delimiter}${previous ?? ""}`;
    }
    return await fn();
  } finally {
    process.env.PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
