/** Closed set of upgrade modes Beefup can apply when rewriting constraints. */
export const UpgradeModes = {
  SameMajor: "same-major",
  Latest: "latest",
} as const;

/** Upgrade mode selecting same-major or latest constraint rewriting. */
export type UpgradeMode = (typeof UpgradeModes)[keyof typeof UpgradeModes];

/** Closed set of isolation strategies used while staging an upgrade. */
export const StageStrategies = {
  Worktree: "worktree",
  Inplace: "inplace",
} as const;

/** Strategy name for how the staging workspace is isolated. */
export type StageStrategyName =
  (typeof StageStrategies)[keyof typeof StageStrategies];

/** Closed set of human-readable report files written under `.beefup/report`. */
export const ReportFormats = {
  Html: "html",
  Markdown: "markdown",
  Text: "text",
} as const;

/** On-disk human-readable report format (`html`, `markdown`, or `text`). */
export type ReportFormat = (typeof ReportFormats)[keyof typeof ReportFormats];

/** Closed set of policy actions for alignment and similar findings. */
export const AlignmentActions = {
  Error: "error",
  Warn: "warn",
} as const;

/** Whether an alignment mismatch fails the run or only warns. */
export type AlignmentAction =
  (typeof AlignmentActions)[keyof typeof AlignmentActions];

/** Floating tags/ranges that projects may ban in dependency specs. */
export const BannedRangeTags = {
  Latest: UpgradeModes.Latest,
  Any: "*",
} as const;

/** Top-level CLI command names Beefup accepts. */
export const CliCommands = {
  Stage: "stage",
  Report: "report",
  Accept: "accept",
  Revert: "revert",
  Rewind: "rewind",
} as const;

/** CLI option flags Beefup parses from argv. */
export const CliOptionFlags = {
  Help: "--help",
  HelpShort: "-h",
  Version: "--version",
  VersionShort: "-v",
  Mode: "--mode",
  Strategy: "--strategy",
  Dir: "--dir",
  Format: "--format",
  PackageRoot: "--package-root",
  NoSafeChain: "--no-safe-chain",
  Quiet: "--quiet",
  QuietShort: "-q",
  Verbose: "--verbose",
  VerboseShort: "-V",
  Debug: "--debug",
  LogLevel: "--log-level",
} as const;

/** Closed set of stderr log verbosity levels. */
export const LogLevels = {
  Quiet: "quiet",
  Warn: "warn",
  Info: "info",
  Debug: "debug",
} as const;

/** Stderr log verbosity (`quiet`, `warn`, `info`, or `debug`). */
export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/** Default log level: warnings and errors only. */
export const DefaultLogLevel = LogLevels.Warn;

/** Default package-root path: manifests live at the project root. */
export const DefaultPackageRoot = "." as const;

/** CLI command name (`stage`, `report`, `accept`, `revert`, or `rewind`). */
export type CliCommand = (typeof CliCommands)[keyof typeof CliCommands];

/** Closed set of report comparison contexts (proposal vs applied). */
export const ReportComparisons = {
  Proposal: "proposal",
  Applied: "applied",
} as const;

/** Whether the report compares live-vs-staged or prior-vs-live. */
export type ReportComparison =
  (typeof ReportComparisons)[keyof typeof ReportComparisons];

/**
 * Returns true when `value` is a known upgrade mode.
 */
export function isUpgradeMode(value: unknown): value is UpgradeMode {
  return (
    value === UpgradeModes.SameMajor || value === UpgradeModes.Latest
  );
}

/**
 * Returns true when `value` is a known stage strategy.
 */
export function isStageStrategy(value: unknown): value is StageStrategyName {
  return (
    value === StageStrategies.Worktree || value === StageStrategies.Inplace
  );
}

/**
 * Returns true when `value` is a known report format.
 */
export function isReportFormat(value: unknown): value is ReportFormat {
  return (
    typeof value === "string" &&
    (Object.values(ReportFormats) as string[]).includes(value)
  );
}

/**
 * Returns true when `value` is a known alignment action.
 */
export function isAlignmentAction(value: unknown): value is AlignmentAction {
  return (
    value === AlignmentActions.Error || value === AlignmentActions.Warn
  );
}

/**
 * Returns true when `value` is a known report comparison context.
 */
export function isReportComparison(value: unknown): value is ReportComparison {
  return (
    value === ReportComparisons.Proposal || value === ReportComparisons.Applied
  );
}

/**
 * Returns true when `value` is a known log verbosity level.
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" &&
    (Object.values(LogLevels) as string[]).includes(value)
  );
}

export interface AlignedGroup {
  name: string;
  source: string;
  packages: string[];
  onMismatch?: AlignmentAction;
}

export interface BeefupConfig {
  mode: UpgradeMode;
  bannedRanges: string[];
  preferExact: boolean;
  alignedGroups: AlignedGroup[];
  alignment?: AlignmentAction;
}

/** Default Beefup project config when none is supplied in package manifests. */
export const DEFAULT_CONFIG: BeefupConfig = {
  mode: UpgradeModes.SameMajor,
  bannedRanges: [BannedRangeTags.Latest, BannedRangeTags.Any],
  preferExact: true,
  alignedGroups: [],
  alignment: AlignmentActions.Error,
};
