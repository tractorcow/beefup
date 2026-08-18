import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { BeefupError } from "../errors.js";
import type { PackageManager } from "../project/types.js";

const execFile = promisify(execFileCallback);

export interface ProtectedPm {
  bin: string;
  prefixArgs: string[];
}

export function aikidoBinName(packageManager: PackageManager): string {
  return packageManager === "npm" ? "aikido-npm" : "aikido-pnpm";
}

async function which(bin: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile("which", [bin], { encoding: "utf8" });
    const resolved = stdout.trim();
    return resolved.length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveProtectedPm(
  packageManager: PackageManager
): Promise<ProtectedPm> {
  const aikido = await which(aikidoBinName(packageManager));
  if (aikido) {
    return { bin: aikido, prefixArgs: [] };
  }

  const safeChain = await which("safe-chain");
  if (safeChain) {
    return { bin: safeChain, prefixArgs: [packageManager] };
  }

  throw new BeefupError(
    `Safe-chain is not enabled: neither ${aikidoBinName(packageManager)} nor safe-chain was found on PATH. Install Aikido Safe Chain and ensure it wraps ${packageManager}.`
  );
}

function parseMajorVersion(raw: string): number | undefined {
  const match = raw.trim().match(/(\d+)\./);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

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
