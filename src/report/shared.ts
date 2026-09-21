import {
  DefaultPackageRoot,
  ReportComparisons,
  type ReportComparison,
} from "../config/types.js";
import { groupByChangeType } from "../diff/group.js";
import { BEEFUP_DIR, BeefupSnapshots } from "../project/paths.js";
import type { StageReport } from "./types.js";

/** Display titles for security finding buckets. */
export const SecuritySectionTitles = {
  Introduced: "Introduced",
  Unresolved: "Unresolved",
  Fixed: "Fixed",
} as const;

/** Short blurbs explaining each security section under its heading (proposal copy). */
export const SecuritySectionIntros = {
  Introduced:
    "New findings that appear only after this staged upgrade. Review before accept — these are regressions.",
  Unresolved:
    "Findings still present after the upgrade. They were not fixed by this proposal and remain open risk.",
  Fixed:
    "Findings present before the upgrade that no longer appear afterward. Cleared by this staged proposal.",
} as const;

/** Applied-report blurbs for the same security sections. */
const AppliedSecuritySectionIntros = {
  Introduced:
    "New findings that appear only on the live tree versus prior. They were not present in the historic lockfile.",
  Unresolved:
    "Findings still present on the live tree. They were not cleared relative to prior and remain open risk.",
  Fixed:
    "Findings present in the prior lockfile that no longer appear on the live tree.",
} as const;

/**
 * Returns the intro blurb for a security section, using applied wording after
 * accept/rewind/revert and proposal wording after stage.
 */
export function securitySectionIntro(
  section: (typeof SecuritySectionTitles)[keyof typeof SecuritySectionTitles],
  comparison: ReportComparison | undefined
): string {
  const intros =
    comparison === ReportComparisons.Applied
      ? AppliedSecuritySectionIntros
      : SecuritySectionIntros;
  return intros[section];
}

/**
 * Summary line when the after tree has no findings that were absent before.
 */
export function noIntroducedSummary(
  comparison: ReportComparison | undefined
): string {
  if (comparison === ReportComparisons.Applied) {
    return "No new security findings in the live tree versus prior";
  }
  return "No new security findings introduced by this staged upgrade";
}

/**
 * Warning summary when findings appear only on the after tree.
 */
export function introducedSummary(
  count: number,
  comparison: ReportComparison | undefined
): string {
  if (comparison === ReportComparisons.Applied) {
    return `Warning: ${securityFindingCountLabel(count)} introduced versus prior`;
  }
  return `Warning: ${securityFindingCountLabel(count)} introduced — review before accept`;
}

/**
 * Returns a count plus "security finding(s)" for summary and stderr warnings.
 */
export function securityFindingCountLabel(count: number): string {
  return count === 1 ? "1 security finding" : `${count} security findings`;
}

/**
 * Returns the nested package-root path when manifests are not at the project root.
 */
export function nestedPackageRoot(report: StageReport): string | undefined {
  const value = report.packageRoot?.trim();
  if (!value || value === DefaultPackageRoot) {
    return undefined;
  }
  return value;
}

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

/**
 * Returns a human-readable label for which trees a report compared.
 */
export function comparisonLabel(
  comparison: ReportComparison | undefined
): string {
  if (comparison === ReportComparisons.Applied) {
    return "prior (old) vs live (new)";
  }
  return "live (old) vs staged (new)";
}

/**
 * Returns the path hint for the report's old/baseline tree.
 */
export function comparisonPathsLine(
  comparison: ReportComparison | undefined
): string {
  if (comparison === ReportComparisons.Applied) {
    return `Baseline: ${BEEFUP_DIR}/${BeefupSnapshots.Prior}`;
  }
  return `Staged proposal: ${BEEFUP_DIR}/${BeefupSnapshots.Staged}`;
}
