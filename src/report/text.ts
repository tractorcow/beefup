import { AlignmentActions } from "../config/types.js";
import { formatUniqueVersions } from "../diff/diff.js";
import { groupByChangeType } from "../diff/group.js";
import { PackageChangeTypes, type PackageChange } from "../diff/types.js";
import type { SecurityFinding } from "../security/classify.js";
import { formatRefsText } from "../security/refs.js";
import type { StageReport } from "./types.js";

/**
 * Formats a single package change as a plain-text report line.
 */
function formatChange(change: PackageChange): string {
  const from = formatUniqueVersions(change.from);
  const to = formatUniqueVersions(change.to);
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
function formatChanges(title: string, changes: PackageChange[]): string[] {
  if (changes.length === 0) {
    return [];
  }
  const required = changes.filter((change) => !change.optional);
  const optional = changes.filter((change) => change.optional);
  const parts = [title];
  parts.push(...formatChangeGroups(required));
  if (optional.length > 0) {
    parts.push(`Optional / platform (${optional.length}):`);
    parts.push(...formatChangeGroups(optional));
  }
  return parts;
}

/**
 * Formats changed/added/removed groups for one package list.
 */
function formatChangeGroups(changes: PackageChange[]): string[] {
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
    parts.push(...list.map((item) => formatChange(item)));
  }
  return parts;
}

/**
 * Counts package changes across dependencies and devDependencies.
 */
function packageChangeCounts(report: StageReport): {
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
 * Renders a stage report as plain text for stdout.
 * Leads with summary and security counts, then package diffs.
 */
export function renderText(report: StageReport): string {
  const packages = packageChangeCounts(report);
  const { fixed, introduced, unresolved } = report.security;
  const policyCount =
    report.ranges.length + report.overrides.length + report.alignment.length;

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
    `Security: ${introduced.length} introduced, ${unresolved.length} unresolved, ${fixed.length} fixed`,
    `Policy: ${policyCount === 0 ? "no issues" : `${policyCount} issue(s)`}`
  );

  if (introduced.length === 0) {
    parts.push("No CVEs introduced by this staged upgrade");
  } else {
    parts.push(`Warning: ${introduced.length} CVE(s) introduced — review before accept`);
    parts.push("Introduced:");
    for (const item of introduced) {
      parts.push(
        `  ! ${item.severity} ${formatFindingRefs(item)} ${item.packageName}`
      );
    }
  }

  if (unresolved.length > 0) {
    parts.push(`Unresolved (${unresolved.length}):`);
    for (const item of unresolved) {
      parts.push(
        `  * ${item.severity} ${formatFindingRefs(item)} ${item.packageName}`
      );
    }
  }

  parts.push(...formatChanges("DEPENDENCIES", report.diff.dependencies));
  parts.push(...formatChanges("DEV DEPENDENCIES", report.diff.devDependencies));

  for (const item of report.ranges.filter(
    (finding) => finding.severity === AlignmentActions.Error
  )) {
    parts.push(`error: ${item.message}`);
  }
  for (const item of report.overrides) {
    parts.push(`error: [${item.override}] ${item.message}`);
  }
  for (const item of report.alignment.filter(
    (finding) => finding.severity === AlignmentActions.Error
  )) {
    parts.push(`error: [${item.group}] ${item.message}`);
  }
  for (const warning of report.warnings) {
    parts.push(`warning: ${warning}`);
  }

  parts.push("Legend: [D]=direct, [T]=transitive");

  return `${parts.filter((line) => line !== "").join("\n")}\n`;
}
