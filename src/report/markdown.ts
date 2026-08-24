import { AlignmentActions } from "../config/types.js";
import { PackageChangeType, type PackageChange } from "../diff/types.js";
import { groupByVersionChange } from "../diff/group.js";
import type { SecurityFinding } from "../security/classify.js";
import type { StageReport } from "./types.js";

/**
 * Builds a markdown table for a list of package changes.
 */
function formatChangeTable(changes: PackageChange[]): string {
  const rows = [
    "| Package | From Version | To Version |",
    "|---------|--------------|------------|",
  ];
  for (const change of changes) {
    if (change.type === PackageChangeType.Upgraded) {
      rows.push(
        `| **${change.name}** | \`${change.fromVersion}\` | \`${change.toVersion}\` |`
      );
    } else if (change.type === PackageChangeType.Downgraded) {
      rows.push(
        `| **${change.name}** | \`${change.fromVersion}\` | \`${change.toVersion}\` |`
      );
    } else if (change.type === PackageChangeType.Added) {
      rows.push(`| **${change.name}** | — | \`${change.toVersion}\` |`);
    } else if (change.type === PackageChangeType.Removed) {
      rows.push(`| **${change.name}** | \`${change.fromVersion}\` | — |`);
    }
  }
  return rows.join("\n");
}

/**
 * Formats dependency changes as markdown sections by update kind.
 */
function formatChanges(changes: PackageChange[]): string {
  const byType = groupByVersionChange(changes);
  const parts: string[] = [];
  const sections: Array<[string, PackageChange[]]> = [
    ["Major Updates", byType.major],
    ["Minor Updates", byType.minor],
    ["Patch Updates", byType.patch],
    ["Added Packages", byType.added],
    ["Removed Packages", byType.removed],
    ["Downgraded Packages", byType.downgraded],
  ];
  for (const [title, list] of sections) {
    if (list.length === 0) {
      continue;
    }
    parts.push(`### ${title}`);
    parts.push(formatChangeTable(list));
  }
  return parts.join("\n\n");
}

/**
 * Formats a markdown section listing security findings, or "None." when empty.
 */
function formatFindings(title: string, findings: SecurityFinding[]): string {
  if (findings.length === 0) {
    return `### ${title}\n\nNone.`;
  }
  const rows = [
    `### ${title}`,
    "",
    "| Severity | ID | Package | Source |",
    "|----------|----|---------|--------|",
    ...findings.map(
      (item) =>
        `| ${item.severity} | \`${item.id}\` | \`${item.packageName}\` | ${item.source} |`
    ),
  ];
  return rows.join("\n");
}

/**
 * Renders a stage report as markdown for files or stdout.
 */
export function renderMarkdown(report: StageReport): string {
  const parts: string[] = [
    "# Beefup upgrade report",
    "",
    `- Mode: \`${report.mode}\``,
    `- Strategy: \`${report.strategy}\``,
    `- Package manager: \`${report.packageManager}\``,
  ];

  if (report.diff.dependencies.length > 0) {
    parts.push("", "## Dependencies", "", formatChanges(report.diff.dependencies));
  }
  if (report.diff.devDependencies.length > 0) {
    parts.push(
      "",
      "## Dev Dependencies",
      "",
      formatChanges(report.diff.devDependencies)
    );
  }

  parts.push("", "## Policy");
  if (report.ranges.length === 0 && report.overrides.length === 0 && report.alignment.length === 0) {
    parts.push("", "No policy issues.");
  } else {
    for (const item of report.ranges) {
      parts.push(`- **${item.severity}** ${item.message}`);
    }
    for (const item of report.overrides) {
      parts.push(`- **${AlignmentActions.Error}** [${item.override}] ${item.message}`);
    }
    for (const item of report.alignment) {
      parts.push(`- **${item.severity}** [${item.group}] ${item.message}`);
    }
  }

  parts.push("", "## Security");
  parts.push("", formatFindings("Fixed", report.security.fixed));
  parts.push("", formatFindings("Introduced", report.security.introduced));
  parts.push("", formatFindings("Retained", report.security.retained));

  if (report.warnings.length > 0) {
    parts.push("", "## Warnings");
    for (const warning of report.warnings) {
      parts.push(`- ${warning}`);
    }
  }

  return `${parts.join("\n")}\n`;
}
