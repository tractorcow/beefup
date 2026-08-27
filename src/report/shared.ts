import { groupByChangeType } from "../diff/group.js";
import type { StageReport } from "./types.js";

/** Display titles for security finding buckets. */
export const SecuritySectionTitles = {
  Introduced: "Introduced",
  Unresolved: "Unresolved",
  Fixed: "Fixed",
} as const;

/** Short blurbs explaining each security section under its heading. */
export const SecuritySectionIntros = {
  Introduced:
    "New findings that appear only after this staged upgrade. Review before accept — these are regressions.",
  Unresolved:
    "Findings still present after the upgrade. They were not fixed by this proposal and remain open risk.",
  Fixed:
    "Findings present before the upgrade that no longer appear afterward. Cleared by this staged proposal.",
} as const;

/**
 * Counts package changes across dependencies and devDependencies.
 */
export function packageChangeCounts(report: StageReport): {
  changed: number;
  added: number;
  removed: number;
} {
  const deps = groupByChangeType(report.diff.dependencies);
  const dev = groupByChangeType(report.diff.devDependencies);
  return {
    changed: deps.changed.length + dev.changed.length,
    added: deps.added.length + dev.added.length,
    removed: deps.removed.length + dev.removed.length,
  };
}

/**
 * Counts policy findings for the summary section.
 */
export function policyIssueCount(report: StageReport): number {
  return report.ranges.length + report.overrides.length + report.alignment.length;
}
