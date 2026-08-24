import path from "node:path";

import { loadConfig } from "../config/load.js";
import { CliCommands } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { installFromLockfile } from "../pm/install.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { assertPolicy, evaluatePolicy } from "../policy/evaluate.js";
import { applyStagedOutputs, requireStagedUpgrade } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { inProgressPath } from "../project/paths.js";
import { PackageManagers, type PackageManager } from "../project/types.js";

export interface AcceptOptions {
  projectRoot: string;
  runner?: ProcessRunner;
}

export interface AcceptResult {
  packageManager: PackageManager;
  copied: string[];
  warnings: string[];
}

/**
 * Applies `.beefup/staged` manifests and lockfile to the live project, then
 * installs from that reviewed lockfile via Safe Chain (`npm ci` / frozen pnpm).
 */
export async function runAccept(options: AcceptOptions): Promise<AcceptResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(projectRoot);
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

  const config = await loadConfig(projectRoot);
  const policy = await evaluatePolicy(
    staged,
    project.packageManager,
    project.lockfileName,
    config
  );
  assertPolicy(policy);

  const copied = await applyStagedOutputs(projectRoot, project.lockfileName);
  await installFromLockfile({
    pm: protectedPm,
    packageManager: project.packageManager,
    cwd: projectRoot,
    runner,
  });

  return {
    packageManager: project.packageManager,
    copied,
    warnings: policy.warnings,
  };
}
