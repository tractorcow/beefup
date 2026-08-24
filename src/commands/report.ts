import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config/load.js";
import {
  isStageStrategy,
  isUpgradeMode,
  ReportFormats,
  StageStrategies,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { annotatePackageChanges, diffResolutions } from "../diff/diff.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile } from "../fsutil.js";
import { resolveLockfile } from "../lockfile/resolve.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { assertPolicy, evaluatePolicy } from "../policy/evaluate.js";
import { detectProject } from "../project/detect.js";
import { collectDirectDependencyNames } from "../project/direct-deps.js";
import { reportDir, stagedDir } from "../project/paths.js";
import { PackageManagers } from "../project/types.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderText } from "../report/text.js";
import type { StageReport } from "../report/types.js";
import { classifyFindings } from "../security/classify.js";
import { scanProject } from "../security/scan.js";

export interface ReportOptions {
  projectRoot: string;
  mode?: UpgradeMode;
  strategy?: StageStrategyName;
  format: ReportFormat;
  runner?: ProcessRunner;
}

/**
 * Regenerates the upgrade report for an existing `.beefup/staged` proposal.
 * Writes markdown and JSON under `.beefup/report`.
 */
export async function runReport(options: ReportOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(projectRoot);
  const staged = stagedDir(projectRoot);
  const reports = reportDir(projectRoot);
  const stagedLock = path.join(staged, project.lockfileName);

  if (!(await pathExists(stagedLock))) {
    throw new BeefupError(
      `no staged lockfile at ${path.relative(projectRoot, stagedLock) || stagedLock}; run beefup stage first`
    );
  }

  const previous = await readPreviousReport(reports);
  const config = await loadConfig(
    projectRoot,
    options.mode ?? parseUpgradeMode(previous?.mode)
  );
  const strategy =
    options.strategy ??
    parseStrategy(previous?.strategy) ??
    StageStrategies.Worktree;

  const protectedPm = await resolveProtectedPm(project.packageManager);
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const before = await resolveLockfile(project.lockfilePath, project.packageManager);
  const after = await resolveLockfile(stagedLock, project.packageManager);
  const { directNames, optionalDeclaredNames } =
    await collectDirectDependencyNames(projectRoot);
  const diff = annotatePackageChanges(diffResolutions(before, after), {
    directNames,
    optionalDeclaredNames,
    before,
    after,
  });
  const policy = await evaluatePolicy(
    staged,
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
    root: staged,
    packageManager: project.packageManager,
    pmBin: protectedPm.bin,
    prefixArgs: protectedPm.prefixArgs,
    runner,
  });
  const security = classifyFindings(beforeFindings, afterFindings);

  const report: StageReport = {
    mode: config.mode,
    strategy,
    packageManager: project.packageManager,
    generatedAt: new Date().toISOString(),
    beefupVersion: await readBeefupVersion(),
    diff,
    ranges: policy.ranges,
    overrides: policy.overrides,
    alignment: policy.alignment,
    security,
    warnings: policy.warnings,
  };

  await mkdir(reports, { recursive: true });
  await writeFile(path.join(reports, "REPORT.md"), renderMarkdown(report), "utf8");
  await writeFile(
    path.join(reports, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  assertPolicy(policy);
  return report;
}

/**
 * Formats a stage report for stdout as text, markdown, or JSON.
 */
export function printReport(report: StageReport, format: ReportFormat): string {
  if (format === ReportFormats.Json) {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (format === ReportFormats.Markdown) {
    return renderMarkdown(report);
  }
  return renderText(report);
}

/**
 * Loads the previous report.json if present, otherwise returns undefined.
 */
async function readPreviousReport(reports: string): Promise<StageReport | undefined> {
  const reportPath = path.join(reports, "report.json");
  if (!(await pathExists(reportPath))) {
    return undefined;
  }
  try {
    return await readJsonFile<StageReport>(reportPath);
  } catch {
    return undefined;
  }
}

/**
 * Parses a stored upgrade mode string into a typed mode, or undefined if unknown.
 */
function parseUpgradeMode(value: string | undefined): UpgradeMode | undefined {
  if (isUpgradeMode(value)) {
    return value;
  }
  return undefined;
}

/**
 * Parses a stored strategy string into a typed strategy, or undefined if unknown.
 */
function parseStrategy(value: string | undefined): StageStrategyName | undefined {
  if (isStageStrategy(value)) {
    return value;
  }
  return undefined;
}

/**
 * Reads this package's version from beefup's own package.json.
 */
async function readBeefupVersion(): Promise<string> {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
