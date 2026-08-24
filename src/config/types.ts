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

/** Closed set of report formats written to stdout. */
export const ReportFormats = {
  Color: "color",
  Text: "text",
  Markdown: "markdown",
  Json: "json",
  Html: "html",
} as const;

/** Format used when printing a stage/report result to stdout. */
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
} as const;

/** CLI command name (`stage`, `report`, or `accept`). */
export type CliCommand = (typeof CliCommands)[keyof typeof CliCommands];

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
