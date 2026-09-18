import path from "node:path";

import { CliCommands } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { installFromLockfile } from "../pm/install.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { applyPriorOutputs, requirePriorUpgrade } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { resolveCommandPackageRoot } from "../project/package-root.js";
import { inProgressPath } from "../project/paths.js";
import { PackageManagers, type PackageManager } from "../project/types.js";

export interface RevertOptions {
  projectRoot: string;
  packageRoot?: string;
  runner?: ProcessRunner;
}

export interface RevertResult {
  packageManager: PackageManager;
  copied: string[];
}

/**
 * Restores `.beefup/prior` manifests onto the live tree and installs from that
 * frozen lockfile. Leaves prior and staged snapshots in place.
 */
export async function runRevert(options: RevertOptions): Promise<RevertResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = await resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(packageRoot.absolute);
  await requirePriorUpgrade(projectRoot, project.lockfileName);

  const inProgress = inProgressPath(projectRoot);
  if (await pathExists(inProgress)) {
    throw new BeefupError(
      `cannot revert while an in-place ${CliCommands.Stage} is in progress (${path.relative(projectRoot, inProgress) || inProgress}); run beefup ${CliCommands.Stage} to restore the live tree first`
    );
  }

  const protectedPm = await resolveProtectedPm(project.packageManager);
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const copied = await applyPriorOutputs(
    projectRoot,
    packageRoot.absolute,
    project.lockfileName
  );
  await installFromLockfile({
    pm: protectedPm,
    packageManager: project.packageManager,
    cwd: packageRoot.absolute,
    runner,
  });

  return {
    packageManager: project.packageManager,
    copied,
  };
}
