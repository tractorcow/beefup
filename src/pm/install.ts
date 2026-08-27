import { BeefupError } from "../errors.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import type { ProcessRunner } from "./runner.js";
import type { ProtectedPm } from "./safe-chain.js";

/**
 * Frozen-lockfile install argv per package manager (never a bare mutating install).
 */
export const FrozenInstallArgv = {
  [PackageManagers.Npm]: ["ci"],
  [PackageManagers.Pnpm]: ["install", "--frozen-lockfile"],
} as const;

/**
 * Returns argv that installs node_modules exactly from the current lockfile.
 */
export function frozenInstallArgs(packageManager: PackageManager): string[] {
  return [...FrozenInstallArgv[packageManager]];
}

/**
 * Installs packages from the live lockfile through a Safe Chain–protected package manager.
 * Uses `npm ci` or `pnpm install --frozen-lockfile` so the reviewed lockfile is not rewritten.
 */
export async function installFromLockfile(options: {
  pm: ProtectedPm;
  packageManager: PackageManager;
  cwd: string;
  runner: ProcessRunner;
}): Promise<void> {
  const args = [
    ...options.pm.prefixArgs,
    ...frozenInstallArgs(options.packageManager),
  ];
  const result = await options.runner.run(options.pm.bin, args, options.cwd);
  if (result.code !== 0) {
    throw new BeefupError(
      `frozen install failed (${options.pm.bin} ${args.join(" ")}):\n${result.stderr || result.stdout}`
    );
  }
}
