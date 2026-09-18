import path from "node:path";

import { CliCommands, ReportFormats } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { installFromLockfile } from "../pm/install.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import {
  applyPriorOutputs,
  removeStagedOutputs,
  requirePriorUpgrade,
} from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { resolveCommandPackageRoot } from "../project/package-root.js";
import { inProgressPath } from "../project/paths.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import { runReport } from "./report.js";

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
 * Restores `.beefup/prior` onto the live tree, removes `.beefup/staged`, and
 * installs from the frozen lockfile. Leaves prior in place as the baseline.
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
  await removeStagedOutputs(projectRoot);
  await installFromLockfile({
    pm: protectedPm,
    packageManager: project.packageManager,
    cwd: packageRoot.absolute,
    runner,
  });

  await runReport({
    projectRoot,
    packageRoot: packageRoot.relative,
    format: ReportFormats.Color,
    runner,
  });

  return {
    packageManager: project.packageManager,
    copied,
  };
}
