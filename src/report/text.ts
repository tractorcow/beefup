import { AlignmentActions } from "../config/types.js";
import { formatUniqueVersions } from "../diff/diff.js";
import { groupByChangeType } from "../diff/group.js";
import { PackageChangeTypes, type PackageChange } from "../diff/types.js";
import type { FindingSeverity, SecurityFinding } from "../security/classify.js";
import { formatRefsText } from "../security/refs.js";
import { Ansi, ansiForSeverity, paint } from "./ansi.js";
import { packageChangeCounts, policyIssueCount } from "./shared.js";
import type { StageReport } from "./types.js";

export interface TextRenderOptions {
  /** When true, wrap severities and version comparisons in ANSI colour. */
  color?: boolean;
}

/**
 * Formats a version string for display, optionally painting from/to sides.
 */
function formatVersion(
  versions: string,
  color: boolean,
  side: "from" | "to"
): string {
  if (versions.length === 0 || versions === "—") {
    return versions;
  }
  return side === "from"
    ? paint(Ansi.Red, versions, color)
    : paint(Ansi.Green, versions, color);
}

/**
 * Formats a single package change as a plain-text report line.
 */
function formatChange(change: PackageChange, color: boolean): string {
  const from = formatVersion(formatUniqueVersions(change.from), color, "from");
  const to = formatVersion(formatUniqueVersions(change.to), color, "to");
  const marker = change.direct ? "D" : "T";
  const optional = change.optional ? " [optional]" : "";
  switch (change.type) {
    case PackageChangeTypes.Added:
      return `  + [${marker}]${optional} ${change.name}@${to}`;
    case PackageChangeTypes.Removed:
      return `  - [${marker}]${optional} ${change.name}@${from}`;
    case PackageChangeTypes.Changed:
      return `  ~ [${marker}]${optional} ${change.name}: ${from} → ${to}`;
  }
}

/**
 * Formats a titled section of dependency changes grouped by change kind.
 */
function formatChanges(
  title: string,
  changes: PackageChange[],
  color: boolean
): string[] {
  if (changes.length === 0) {
    return [];
  }
  const required = changes.filter((change) => !change.optional);
  const optional = changes.filter((change) => change.optional);
  const parts = [title];
  parts.push(...formatChangeGroups(required, color));
  if (optional.length > 0) {
    parts.push(`Optional / platform (${optional.length}):`);
    parts.push(...formatChangeGroups(optional, color));
  }
  return parts;
}

/**
 * Formats changed/added/removed groups for one package list.
 */
function formatChangeGroups(changes: PackageChange[], color: boolean): string[] {
  if (changes.length === 0) {
    return [];
  }
  const byType = groupByChangeType(changes);
  const parts: string[] = [];
  const sections: Array<[string, PackageChange[]]> = [
    ["Changed Packages", byType.changed],
    ["Added Packages", byType.added],
    ["Removed Packages", byType.removed],
  ];
  for (const [label, list] of sections) {
    if (list.length === 0) {
      continue;
    }
    parts.push(`${label} (${list.length}):`);
    parts.push(...list.map((item) => formatChange(item, color)));
  }
  return parts;
}

/**
 * Formats a finding's refs or meta-vuln via label for plain text.
 */
function formatFindingRefs(finding: SecurityFinding): string {
  if (finding.refs.length > 0) {
    return formatRefsText(finding.refs);
  }
  if (finding.viaPackages && finding.viaPackages.length > 0) {
    return `transitive (via ${finding.viaPackages.join(", ")})`;
  }
  return "—";
}

/**
 * Paints a severity label when colour is enabled.
 */
function formatSeverity(severity: FindingSeverity, color: boolean): string {
  return paint(ansiForSeverity(severity), severity, color);
}

/**
 * Paints a count when it is non-zero so zeros stay unstyled.
 */
function paintCount(
  count: number,
  codes: string | readonly string[],
  color: boolean
): string {
  const text = String(count);
  if (count === 0) {
    return text;
  }
  return paint(codes, text, color);
}

/**
 * Renders a stage report as plain text for stdout.
 * When `color` is true, severities and from/to versions use ANSI colour.
 */
export function renderText(
  report: StageReport,
  options: TextRenderOptions = {}
): string {
  const color = options.color === true;
  const packages = packageChangeCounts(report);
  const { fixed, introduced, unresolved } = report.security;
  const policyCount = policyIssueCount(report);

  const parts = [
    `Beefup stage (${report.packageManager}, mode=${report.mode}, strategy=${report.strategy})`,
  ];
  if (report.beefupVersion) {
    parts.push(`Beefup ${report.beefupVersion}`);
  }
  if (report.generatedAt) {
    parts.push(`Generated ${report.generatedAt}`);
  }
  parts.push(
    `Summary: ${packages.changed} changed, ${packages.added} added, ${packages.removed} removed packages`,
    `Security: ${paintCount(introduced.length, Ansi.Red, color)} introduced, ${paintCount(unresolved.length, Ansi.Yellow, color)} unresolved, ${paintCount(fixed.length, Ansi.Green, color)} fixed`,
    `Policy: ${policyCount === 0 ? "no issues" : `${policyCount} issue(s)`}`
  );

  if (introduced.length === 0) {
    parts.push("No CVEs introduced by this staged upgrade");
  } else {
    parts.push(
      paint(
        [Ansi.Bold, Ansi.Red],
        `Warning: ${introduced.length} CVE(s) introduced — review before accept`,
        color
      )
    );
    parts.push("Introduced:");
    for (const item of introduced) {
      parts.push(
        `  ! ${formatSeverity(item.severity, color)} ${formatFindingRefs(item)} ${item.packageName}`
      );
    }
  }

  if (unresolved.length > 0) {
    parts.push(`Unresolved (${unresolved.length}):`);
    for (const item of unresolved) {
      parts.push(
        `  * ${formatSeverity(item.severity, color)} ${formatFindingRefs(item)} ${item.packageName}`
      );
    }
  }

  parts.push(...formatChanges("DEPENDENCIES", report.diff.dependencies, color));
  parts.push(...formatChanges("DEV DEPENDENCIES", report.diff.devDependencies, color));

  for (const item of report.ranges.filter(
    (finding) => finding.severity === AlignmentActions.Error
  )) {
    parts.push(paint(Ansi.Red, `error: ${item.message}`, color));
  }
  for (const item of report.overrides) {
    parts.push(paint(Ansi.Red, `error: [${item.override}] ${item.message}`, color));
  }
  for (const item of report.alignment.filter(
    (finding) => finding.severity === AlignmentActions.Error
  )) {
    parts.push(paint(Ansi.Red, `error: [${item.group}] ${item.message}`, color));
  }
  for (const warning of report.warnings) {
    parts.push(paint(Ansi.Yellow, `warning: ${warning}`, color));
  }

  parts.push("Legend: [D]=direct, [T]=transitive");

  return `${parts.filter((line) => line !== "").join("\n")}\n`;
}
