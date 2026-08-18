import path from "node:path";

import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import type { PackageJson } from "./package-json.js";
import type { DetectedProject, PackageManager } from "./types.js";

function managerFromPackageManagerField(
  field: string | undefined
): PackageManager | undefined {
  if (!field) {
    return undefined;
  }
  if (field.startsWith("pnpm@")) {
    return "pnpm";
  }
  if (field.startsWith("npm@")) {
    return "npm";
  }
  return undefined;
}

export async function detectProject(root: string): Promise<DetectedProject> {
  const pkgPath = path.join(root, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new BeefupError(`no package.json at ${root}`);
  }
  const pkg = await readJsonFile<PackageJson>(pkgPath);
  const pnpmLock = path.join(root, "pnpm-lock.yaml");
  const npmLock = path.join(root, "package-lock.json");
  const hasPnpm = await pathExists(pnpmLock);
  const hasNpm = await pathExists(npmLock);
  const hinted = managerFromPackageManagerField(pkg.packageManager);

  if (hasPnpm && hasNpm) {
    if (!hinted) {
      throw new BeefupError(
        "both pnpm-lock.yaml and package-lock.json exist; set packageManager in package.json"
      );
    }
    return hinted === "pnpm"
      ? {
          root,
          packageManager: "pnpm",
          lockfileName: "pnpm-lock.yaml",
          lockfilePath: pnpmLock,
        }
      : {
          root,
          packageManager: "npm",
          lockfileName: "package-lock.json",
          lockfilePath: npmLock,
        };
  }

  if (hasPnpm || hinted === "pnpm") {
    if (!hasPnpm) {
      throw new BeefupError(`no pnpm-lock.yaml at ${root}`);
    }
    return {
      root,
      packageManager: "pnpm",
      lockfileName: "pnpm-lock.yaml",
      lockfilePath: pnpmLock,
    };
  }

  if (hasNpm || hinted === "npm") {
    if (!hasNpm) {
      throw new BeefupError(`no package-lock.json at ${root}`);
    }
    return {
      root,
      packageManager: "npm",
      lockfileName: "package-lock.json",
      lockfilePath: npmLock,
    };
  }

  throw new BeefupError(
    `no pnpm-lock.yaml or package-lock.json at ${root}`
  );
}
