import path from "node:path";

import { loadConfig } from "../config/load.js";
import type { ReportFormat, StageStrategyName, UpgradeMode } from "../config/types.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { regenerateLockfile } from "../pm/update.js";
import { collectStagedOutputs } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { PackageManagers } from "../project/types.js";
import type { StageReport } from "../report/types.js";
import { lockfilePathFor, repinWorkspace, rewriteWorkspace } from "../rewrite/workspace.js";
import { createStageStrategy } from "../strategy/index.js";
import { runReport } from "./report.js";

export interface StageOptions {
  projectRoot: string;
  mode?: UpgradeMode;
  strategy: StageStrategyName;
  format: ReportFormat;
  runner?: ProcessRunner;
}

/**
 * Stages a dependency upgrade into `.beefup/staged`, then regenerates the report.
 * Uses the selected isolation strategy and restores the workspace on exit or signal.
 */
export async function runStage(options: StageOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(projectRoot);
  const config = await loadConfig(projectRoot, options.mode);
  const protectedPm = await resolveProtectedPm(project.packageManager);
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const strategy = createStageStrategy(
    options.strategy,
    projectRoot,
    project.lockfileName
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
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await strategy.cleanup();
  }

  return runReport({
    projectRoot,
    mode: config.mode,
    strategy: options.strategy,
    format: options.format,
    runner,
  });
}

export { printReport } from "./report.js";
