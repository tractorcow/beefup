export type UpgradeMode = "same-major" | "latest";
export type StageStrategyName = "worktree" | "inplace";
export type ReportFormat = "text" | "markdown" | "json";
export type AlignmentAction = "error" | "warn";

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

export const DEFAULT_CONFIG: BeefupConfig = {
  mode: "same-major",
  bannedRanges: ["latest", "*"],
  preferExact: true,
  alignedGroups: [],
  alignment: "error",
};
