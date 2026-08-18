import { readFile } from "node:fs/promises";

import type { PackageManager } from "../project/types.js";
import { resolveNpmLockfile } from "./npm.js";
import { resolvePnpmLockfile } from "./pnpm.js";
import type { Resolution } from "./types.js";

export async function resolveLockfile(
  lockfilePath: string,
  packageManager: PackageManager
): Promise<Resolution> {
  if (packageManager === "npm") {
    return resolveNpmLockfile(lockfilePath);
  }
  return resolvePnpmLockfile(lockfilePath);
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
