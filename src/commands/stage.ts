import path from "node:path";

import { loadConfig } from "../config/load.js";
import {
  ReportComparisons,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { getLogger } from "../log.js";
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
  /** Overrides config `strategy` when set. */
  strategy?: StageStrategyName;
  /** Overrides config `format` when set. */
  format?: ReportFormat;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
  /** When true, leave override pins unchanged (overrides CLI/config default). */
  preserveOverrides?: boolean;
  /** When true, hide package-manager output unless lockfile regeneration fails. */
  quietPm?: boolean;
  runner?: ProcessRunner;
}

/**
 * Stages a dependency upgrade into `.beefup/staged`, then regenerates the report.
 * Uses the selected isolation strategy and restores the workspace on exit or signal.
 */
export async function runStage(options: StageOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const log = getLogger();
  const project = await detectProject(packageRoot.absolute);
  const config = await loadConfig(
    projectRoot,
    packageRoot.absolute,
    options.mode
  );
  const preserveOverrides =
    options.preserveOverrides === true || config.preserveOverrides;
  const strategyName = options.strategy ?? config.strategy;
  const format = options.format ?? config.format;
  const noSafeChain = options.noSafeChain === true || config.noSafeChain;
  const quietPm = options.quietPm === true || config.quietPm;
  log.info(
    `staging ${packageRoot.relative} with ${project.packageManager} (${strategyName}, ${config.mode})`
  );
  const protectedPm = await resolveProtectedPm(project.packageManager, {
    noSafeChain,
  });
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const strategy = createStageStrategy(
    strategyName,
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
    const workspace = await log.timed("preparing staging workspace", () =>
      strategy.prepare()
    );
    await log.timed("rewriting version constraints", () =>
      rewriteWorkspace(workspace.root, config.mode, { preserveOverrides })
    );
    await log.timed("regenerating lockfile", () =>
      regenerateLockfile({
        pm: protectedPm,
        packageManager: project.packageManager,
        cwd: workspace.root,
        runner,
        stream: !quietPm,
      })
    );
    await log.timed("re-pinning workspace", () =>
      repinWorkspace(
        workspace.root,
        lockfilePathFor(workspace.root, project.lockfileName),
        project.packageManager,
        { preserveOverrides }
      )
    );
    await log.timed("collecting staged outputs", () =>
      collectStagedOutputs(
        workspace.root,
        packageRoot.absolute,
        project.lockfileName
      )
    );
    await removePriorOutputs(packageRoot.absolute);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await strategy.cleanup();
  }

  return log.timed("generating report", () =>
    runReport({
      projectRoot,
      packageRoot: packageRoot.relative,
      mode: config.mode,
      strategy: strategyName,
      format,
      runner,
      comparison: ReportComparisons.Proposal,
      noSafeChain,
    })
  );
}

export { printReport } from "./report.js";
