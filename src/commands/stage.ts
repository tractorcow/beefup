import path from "node:path";

import { loadConfig } from "../config/load.js";
import {
  ReportComparisons,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { regenerateLockfile } from "../pm/update.js";
import { collectStagedOutputs, removePriorOutputs } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { resolveCommandPackageRoot } from "../project/package-root.js";
import { PackageManagers } from "../project/types.js";
import type { StageReport } from "../report/types.js";
import { lockfilePathFor, repinWorkspace, rewriteWorkspace } from "../rewrite/workspace.js";
import { createStageStrategy } from "../strategy/index.js";
import { runReport } from "./report.js";

export interface StageOptions {
  projectRoot: string;
  /** Directory with package.json and the lockfile, relative to the project root. */
  packageRoot?: string;
  mode?: UpgradeMode;
  strategy: StageStrategyName;
  format: ReportFormat;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
  runner?: ProcessRunner;
}

/**
 * Stages a dependency upgrade into `.beefup/staged`, then regenerates the report.
 * Uses the selected isolation strategy and restores the workspace on exit or signal.
 */
export async function runStage(options: StageOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = await resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(packageRoot.absolute);
  const config = await loadConfig(packageRoot.absolute, options.mode);
  const protectedPm = await resolveProtectedPm(project.packageManager, {
    noSafeChain: options.noSafeChain,
  });
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const strategy = createStageStrategy(
    options.strategy,
    projectRoot,
    project.lockfileName,
    packageRoot.absolute
  );

  /**
   * Cleans up the staging strategy and exits when the process receives SIGINT/SIGTERM.
   */
  const onSignal = () => {
    void strategy.cleanup().finally(() => process.exit(1));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const workspace = await strategy.prepare();
    await rewriteWorkspace(workspace.root, config.mode);
    await regenerateLockfile({
      pm: protectedPm,
      packageManager: project.packageManager,
      cwd: workspace.root,
      runner,
    });
    await repinWorkspace(
      workspace.root,
      lockfilePathFor(workspace.root, project.lockfileName),
      project.packageManager
    );
    await collectStagedOutputs(
      workspace.root,
      projectRoot,
      project.lockfileName
    );
    await removePriorOutputs(projectRoot);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await strategy.cleanup();
  }

  return runReport({
    projectRoot,
    packageRoot: packageRoot.relative,
    mode: config.mode,
    strategy: options.strategy,
    format: options.format,
    runner,
    comparison: ReportComparisons.Proposal,
    noSafeChain: options.noSafeChain,
  });
}

export { printReport } from "./report.js";
