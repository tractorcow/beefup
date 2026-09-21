import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { CliOptionFlags } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { getLogger } from "../log.js";
import { PackageManagers, type PackageManager } from "../project/types.js";

const execFile = promisify(execFileCallback);

/** PATH binary names used to locate Aikido Safe Chain wrappers. */
export const SafeChainBins = {
  Wrapper: "safe-chain",
  AikidoNpm: "aikido-npm",
  AikidoPnpm: "aikido-pnpm",
} as const;

/** Package-manager binary and extra argv prefix used for lockfile and install commands. */
export interface ProtectedPm {
  bin: string;
  prefixArgs: string[];
}

/** Options for resolving the package-manager binary Beefup will invoke. */
export interface ResolveProtectedPmOptions {
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
}

/**
 * Returns the Aikido Safe Chain wrapper binary name for a package manager.
 */
export function aikidoBinName(packageManager: PackageManager): string {
  return packageManager === PackageManagers.Npm
    ? SafeChainBins.AikidoNpm
    : SafeChainBins.AikidoPnpm;
}

/**
 * Resolves an executable on PATH via `which`, or undefined when missing.
 */
async function which(bin: string): Promise<string | undefined> {
  getLogger().debug(`which ${bin}`);
  try {
    const { stdout } = await execFile("which", [bin], { encoding: "utf8" });
    const resolved = stdout.trim();
    return resolved.length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Locates a Safe Chain–protected package manager binary and prefix args.
 * With `noSafeChain`, uses the raw npm/pnpm binary instead of requiring a wrapper.
 */
export async function resolveProtectedPm(
  packageManager: PackageManager,
  options: ResolveProtectedPmOptions = {}
): Promise<ProtectedPm> {
  if (options.noSafeChain) {
    const pm = await resolveRawPm(packageManager);
    getLogger().debug(`using unprotected ${pm.bin}`);
    return pm;
  }

  const aikido = await which(aikidoBinName(packageManager));
  if (aikido) {
    getLogger().info(`using ${aikido}`);
    return { bin: aikido, prefixArgs: [] };
  }

  const safeChain = await which(SafeChainBins.Wrapper);
  if (safeChain) {
    getLogger().info(`using ${safeChain} ${packageManager}`);
    return { bin: safeChain, prefixArgs: [packageManager] };
  }

  throw new BeefupError(
    `Safe-chain is not enabled: neither ${aikidoBinName(packageManager)} nor ${SafeChainBins.Wrapper} was found on PATH. Install Aikido Safe Chain and ensure it wraps ${packageManager}, or pass ${CliOptionFlags.NoSafeChain} to bypass.`
  );
}

/**
 * Resolves the raw npm or pnpm binary on PATH (no Safe Chain wrapper).
 */
async function resolveRawPm(packageManager: PackageManager): Promise<ProtectedPm> {
  const raw = await which(packageManager);
  if (!raw) {
    throw new BeefupError(`${packageManager} was not found on PATH`);
  }
  return { bin: raw, prefixArgs: [] };
}

/**
 * Parses the major version number from a package manager `--version` output.
 */
function parseMajorVersion(raw: string): number | undefined {
  const match = raw.trim().match(/(\d+)\./);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Asserts that the resolved npm binary reports major version 12 or higher.
 */
export async function assertNpmVersion(pm: ProtectedPm): Promise<void> {
  const { stdout, stderr } = await execFile(pm.bin, [...pm.prefixArgs, "--version"], {
    encoding: "utf8",
  });
  const raw = `${stdout}\n${stderr}`;
  const major = parseMajorVersion(raw);
  if (major === undefined) {
    throw new BeefupError(`could not parse npm version from: ${raw.trim()}`);
  }
  if (major < 12) {
    throw new BeefupError(
      `npm 12+ is required (got ${raw.trim().split("\n").pop()})`
    );
  }
}
