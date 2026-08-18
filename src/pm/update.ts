import { BeefupError } from "../errors.js";
import type { PackageManager } from "../project/types.js";
import type { ProcessRunner } from "./runner.js";
import type { ProtectedPm } from "./safe-chain.js";

export function lockfileUpdateArgs(packageManager: PackageManager): string[] {
  if (packageManager === "npm") {
    return ["update", "--package-lock-only", "--ignore-scripts"];
  }
  return ["update", "--lockfile-only", "--ignore-scripts", "--no-save"];
}

export async function regenerateLockfile(options: {
  pm: ProtectedPm;
  packageManager: PackageManager;
  cwd: string;
  runner: ProcessRunner;
}): Promise<void> {
  const args = [
    ...options.pm.prefixArgs,
    ...lockfileUpdateArgs(options.packageManager),
  ];
  const result = await options.runner.run(options.pm.bin, args, options.cwd);
  if (result.code !== 0) {
    throw new BeefupError(
      `lockfile regeneration failed (${options.pm.bin} ${args.join(" ")}):\n${result.stderr || result.stdout}`
    );
  }
}
