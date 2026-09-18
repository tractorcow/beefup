import path from "node:path";

import { loadConfig } from "../config/load.js";
import { CliCommands, ReportFormats } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { installFromLockfile } from "../pm/install.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { assertPolicy, evaluatePolicy } from "../policy/evaluate.js";
import {
  applyStagedOutputs,
  collectPriorOutputs,
  removeStagedOutputs,
  requireStagedUpgrade,
} from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { resolveCommandPackageRoot } from "../project/package-root.js";
import { inProgressPath } from "../project/paths.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import { runReport } from "./report.js";

export interface AcceptOptions {
  projectRoot: string;
  packageRoot?: string;
  runner?: ProcessRunner;
}

export interface AcceptResult {
  packageManager: PackageManager;
  copied: string[];
  warnings: string[];
}

/**
 * Moves live manifests to `.beefup/prior`, copies staged onto the live tree,
 * removes `.beefup/staged`, installs from the frozen lockfile, then regenerates
 * the applied report.
 */
export async function runAccept(options: AcceptOptions): Promise<AcceptResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = await resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(packageRoot.absolute);
  const staged = await requireStagedUpgrade(projectRoot, project.lockfileName);

  const inProgress = inProgressPath(projectRoot);
  if (await pathExists(inProgress)) {
    throw new BeefupError(
      `cannot accept while an in-place ${CliCommands.Stage} is in progress (${path.relative(projectRoot, inProgress) || inProgress}); run beefup ${CliCommands.Stage} to restore the live tree first`
    );
  }

  const protectedPm = await resolveProtectedPm(project.packageManager);
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const config = await loadConfig(packageRoot.absolute);
  const policy = await evaluatePolicy(
    staged,
    project.packageManager,
    project.lockfileName,
    config
  );
  assertPolicy(policy);

  await collectPriorOutputs(
    packageRoot.absolute,
    projectRoot,
    project.lockfileName
  );
  const copied = await applyStagedOutputs(
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
    warnings: policy.warnings,
  };
}
