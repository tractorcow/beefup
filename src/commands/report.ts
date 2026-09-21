import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config/load.js";
import {
  CliCommands,
  isStageStrategy,
  isUpgradeMode,
  ReportComparisons,
  ReportFormats,
  StageStrategies,
  type ReportComparison,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { annotatePackageChanges, diffResolutions } from "../diff/diff.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile, removePath } from "../fsutil.js";
import { resolveLockfile } from "../lockfile/resolve.js";
import { getLogger } from "../log.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { assertNpmVersion, resolveProtectedPm } from "../pm/safe-chain.js";
import { assertPolicy, evaluatePolicy } from "../policy/evaluate.js";
import { detectProject } from "../project/detect.js";
import { collectDirectDependencyNames } from "../project/direct-deps.js";
import { resolveCommandPackageRoot } from "../project/package-root.js";
import {
  HumanReportFileNames,
  priorDir,
  reportDir,
  ReportFileNames,
  stagedDir,
} from "../project/paths.js";
import { PackageManagers } from "../project/types.js";
import { ansiColorEnabled } from "../report/ansi.js";
import { renderHtml } from "../report/html.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderText } from "../report/text.js";
import type { StageReport } from "../report/types.js";
import { classifyFindings } from "../security/classify.js";
import { scanProject } from "../security/scan.js";

export interface ReportOptions {
  projectRoot: string;
  /** Directory with package.json and the lockfile, relative to the project root. */
  packageRoot?: string;
  mode?: UpgradeMode;
  strategy?: StageStrategyName;
  format: ReportFormat;
  runner?: ProcessRunner;
  /** Force proposal or applied trees; otherwise auto-selected. */
  comparison?: ReportComparison;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
}

interface ReportTrees {
  comparison: ReportComparison;
  beforeRoot: string;
  afterRoot: string;
}

/**
 * Chooses live-vs-staged (proposal) or prior-vs-live (applied) comparison trees.
 * Only one snapshot exists at a time: staged after `stage`, prior after accept/rewind/revert.
 */
async function resolveReportTrees(
  projectRoot: string,
  liveRoot: string,
  lockfileName: string,
  forced?: ReportComparison
): Promise<ReportTrees> {
  const staged = stagedDir(projectRoot);
  const prior = priorDir(projectRoot);
  const stagedLock = path.join(staged, lockfileName);
  const priorLock = path.join(prior, lockfileName);
  const stagedExists = await pathExists(stagedLock);
  const priorExists = await pathExists(priorLock);

  if (forced === ReportComparisons.Proposal) {
    if (!stagedExists) {
      throw new BeefupError(
        `no staged lockfile at ${path.relative(projectRoot, stagedLock) || stagedLock}; run beefup ${CliCommands.Stage} first`
      );
    }
    return { comparison: ReportComparisons.Proposal, beforeRoot: liveRoot, afterRoot: staged };
  }
  if (forced === ReportComparisons.Applied) {
    if (!priorExists) {
      throw new BeefupError(
        `no prior lockfile at ${path.relative(projectRoot, priorLock) || priorLock}; run beefup ${CliCommands.Accept} or beefup ${CliCommands.Rewind} first`
      );
    }
    return { comparison: ReportComparisons.Applied, beforeRoot: prior, afterRoot: liveRoot };
  }

  if (stagedExists) {
    return { comparison: ReportComparisons.Proposal, beforeRoot: liveRoot, afterRoot: staged };
  }
  if (priorExists) {
    return { comparison: ReportComparisons.Applied, beforeRoot: prior, afterRoot: liveRoot };
  }
  throw new BeefupError(
    `nothing to compare; run beefup ${CliCommands.Stage} or beefup ${CliCommands.Rewind} first`
  );
}

/**
 * Regenerates the upgrade report for a staged proposal or an applied/prior baseline.
 * Writes `report.json` and one human-readable file under `.beefup/report`.
 */
export async function runReport(options: ReportOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = await resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const log = getLogger();
  const project = await detectProject(packageRoot.absolute);
  const reports = reportDir(projectRoot);
  const trees = await resolveReportTrees(
    projectRoot,
    packageRoot.absolute,
    project.lockfileName,
    options.comparison
  );
  log.info(
    `report ${trees.comparison} for ${packageRoot.relative} (${project.packageManager})`
  );

  const previous = await readPreviousReport(reports);
  const config = await loadConfig(
    packageRoot.absolute,
    options.mode ?? parseUpgradeMode(previous?.mode)
  );
  const strategy =
    options.strategy ??
    parseStrategy(previous?.strategy) ??
    StageStrategies.Worktree;

  const protectedPm = await resolveProtectedPm(project.packageManager, {
    noSafeChain: options.noSafeChain,
  });
  if (project.packageManager === PackageManagers.Npm) {
    await assertNpmVersion(protectedPm);
  }

  const beforeLock = path.join(trees.beforeRoot, project.lockfileName);
  const afterLock = path.join(trees.afterRoot, project.lockfileName);
  const { before, after, fromBefore, fromAfter } = await log.timed(
    "resolving lockfiles",
    async () => {
      const resolvedBefore = await resolveLockfile(
        beforeLock,
        project.packageManager
      );
      const resolvedAfter = await resolveLockfile(
        afterLock,
        project.packageManager
      );
      return {
        before: resolvedBefore,
        after: resolvedAfter,
        fromBefore: await collectDirectDependencyNames(trees.beforeRoot),
        fromAfter: await collectDirectDependencyNames(trees.afterRoot),
      };
    }
  );
  const directNames = new Set([...fromBefore.directNames, ...fromAfter.directNames]);
  const optionalDeclaredNames = new Set([
    ...fromBefore.optionalDeclaredNames,
    ...fromAfter.optionalDeclaredNames,
  ]);
  const diff = annotatePackageChanges(diffResolutions(before, after), {
    directNames,
    optionalDeclaredNames,
    before,
    after,
  });
  const policy = await log.timed("evaluating policy", () =>
    evaluatePolicy(
      trees.afterRoot,
      project.packageManager,
      project.lockfileName,
      config
    )
  );

  const beforeFindings = await log.timed("scanning before tree", () =>
    scanProject({
      root: trees.beforeRoot,
      packageManager: project.packageManager,
      pmBin: protectedPm.bin,
      prefixArgs: protectedPm.prefixArgs,
      runner,
    })
  );
  const afterFindings = await log.timed("scanning after tree", () =>
    scanProject({
      root: trees.afterRoot,
      packageManager: project.packageManager,
      pmBin: protectedPm.bin,
      prefixArgs: protectedPm.prefixArgs,
      runner,
    })
  );
  const security = classifyFindings(beforeFindings, afterFindings);

  const report: StageReport = {
    mode: config.mode,
    strategy,
    packageManager: project.packageManager,
    comparison: trees.comparison,
    packageRoot: packageRoot.relative,
    generatedAt: new Date().toISOString(),
    beefupVersion: await readBeefupVersion(),
    diff,
    ranges: policy.ranges,
    overrides: policy.overrides,
    alignment: policy.alignment,
    security,
    warnings: policy.warnings,
  };

  await log.timed("writing report files", async () => {
    await mkdir(reports, { recursive: true });
    const humanFile = DiskReportFileByFormat[options.format];
    for (const name of HumanReportFileNames) {
      if (name !== humanFile) {
        await removePath(path.join(reports, name));
      }
    }
    await writeFile(
      path.join(reports, humanFile),
      renderDiskReport(report, options.format),
      "utf8"
    );
    await writeFile(
      path.join(reports, ReportFileNames.Json),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
  });

  assertPolicy(policy);
  return report;
}

/** On-disk human-readable file for each `--format` value. */
const DiskReportFileByFormat = {
  [ReportFormats.Html]: ReportFileNames.Html,
  [ReportFormats.Markdown]: ReportFileNames.Markdown,
  [ReportFormats.Text]: ReportFileNames.Text,
} as const;

/**
 * Renders the durable on-disk report for `html`, `markdown`, or `text`.
 */
function renderDiskReport(report: StageReport, format: ReportFormat): string {
  if (format === ReportFormats.Markdown) {
    return renderMarkdown(report);
  }
  if (format === ReportFormats.Text) {
    return renderText(report);
  }
  return renderHtml(report);
}

/**
 * Formats a stage report for stdout as colour text on a TTY, or plain text otherwise.
 */
export function printReport(report: StageReport): string {
  return renderText(report, { color: ansiColorEnabled() });
}

/**
 * Loads the previous report.json if present, otherwise returns undefined.
 */
async function readPreviousReport(reports: string): Promise<StageReport | undefined> {
  const reportPath = path.join(reports, ReportFileNames.Json);
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
