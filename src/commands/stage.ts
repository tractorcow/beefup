import { writeFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config/load.js";
import type { ReportFormat, StageStrategyName, UpgradeMode } from "../config/types.js";
import { diffResolutions } from "../diff/diff.js";
import { resolveLockfile } from "../lockfile/resolve.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { regenerateLockfile } from "../pm/update.js";
import { assertPolicy, evaluatePolicy } from "../policy/evaluate.js";
import { collectStagedOutputs } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import { stagedDir } from "../project/paths.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderText } from "../report/text.js";
import type { StageReport } from "../report/types.js";
import { lockfilePathFor, repinWorkspace, rewriteWorkspace } from "../rewrite/workspace.js";
import { classifyFindings } from "../security/classify.js";
import { scanProject } from "../security/scan.js";
import { createStageStrategy } from "../strategy/index.js";

export interface StageOptions {
  projectRoot: string;
  mode?: UpgradeMode;
  strategy: StageStrategyName;
  format: ReportFormat;
  runner?: ProcessRunner;
}

export async function runStage(options: StageOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(projectRoot);
  const config = await loadConfig(projectRoot, options.mode);
  const protectedPm = await resolveProtectedPm(project.packageManager);
  if (project.packageManager === "npm") {
    await assertNpmVersion(protectedPm);
  }

  const strategy = createStageStrategy(
    options.strategy,
    projectRoot,
    project.lockfileName
  );

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

  const dest = stagedDir(projectRoot);
  const before = await resolveLockfile(project.lockfilePath, project.packageManager);
  const after = await resolveLockfile(
    path.join(dest, project.lockfileName),
    project.packageManager
  );
  const diff = diffResolutions(before, after);
  const policy = await evaluatePolicy(
    dest,
    project.packageManager,
    project.lockfileName,
    config
  );

  const beforeFindings = await scanProject({
    root: projectRoot,
    packageManager: project.packageManager,
    pmBin: protectedPm.bin,
    prefixArgs: protectedPm.prefixArgs,
    runner,
  });
  const afterFindings = await scanProject({
    root: dest,
    packageManager: project.packageManager,
    pmBin: protectedPm.bin,
    prefixArgs: protectedPm.prefixArgs,
    runner,
  });
  const security = classifyFindings(beforeFindings, afterFindings);

  const report: StageReport = {
    mode: config.mode,
    strategy: options.strategy,
    packageManager: project.packageManager,
    diff,
    ranges: policy.ranges,
    overrides: policy.overrides,
    alignment: policy.alignment,
    security,
    warnings: policy.warnings,
  };

  await writeFile(path.join(dest, "REPORT.md"), renderMarkdown(report), "utf8");
  await writeFile(
    path.join(dest, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  assertPolicy(policy);
  return report;
}

export function printReport(report: StageReport, format: ReportFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (format === "markdown") {
    return renderMarkdown(report);
  }
  return renderText(report);
}
