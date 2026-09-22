import path from "node:path";

import { loadConfig } from "../config/load.js";
import { CliCommands, ReportFormats, type ReportFormat } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists } from "../fsutil.js";
import { getLogger } from "../log.js";
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
  format?: ReportFormat;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
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
  const packageRoot = resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const log = getLogger();
  const project = await detectProject(packageRoot.absolute);
  const staged = await requireStagedUpgrade(
    packageRoot.absolute,
    project.lockfileName
  );

  const inProgress = inProgressPath(packageRoot.absolute);
  if (await pathExists(inProgress)) {
    throw new BeefupError(
      `cannot accept while an in-place ${CliCommands.Stage} is in progress (${path.relative(packageRoot.absolute, inProgress) || inProgress}); run beefup ${CliCommands.Stage} to restore the live tree first`
    );
  }

  const protectedPm = await resolveProtectedPm(project.packageManager, {
    noSafeChain: options.noSafeChain,
  });
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const config = await loadConfig(projectRoot, packageRoot.absolute);
  const policy = await evaluatePolicy(
    staged,
    project.packageManager,
    project.lockfileName,
    config
  );
  assertPolicy(policy);

  await log.timed("saving prior snapshot", () =>
    collectPriorOutputs(
      packageRoot.absolute,
      packageRoot.absolute,
      project.lockfileName
    )
  );
  const copied = await log.timed("applying staged outputs", () =>
    applyStagedOutputs(
      packageRoot.absolute,
      packageRoot.absolute,
      project.lockfileName
    )
  );
  await removeStagedOutputs(packageRoot.absolute);
  await log.timed("installing from lockfile", () =>
    installFromLockfile({
      pm: protectedPm,
      packageManager: project.packageManager,
      cwd: packageRoot.absolute,
      runner,
    })
  );

  await log.timed("generating report", () =>
    runReport({
      projectRoot,
      packageRoot: packageRoot.relative,
      format: options.format ?? ReportFormats.Html,
      runner,
      noSafeChain: options.noSafeChain,
    })
  );

  return {
    packageManager: project.packageManager,
    copied,
    warnings: policy.warnings,
  };
}
