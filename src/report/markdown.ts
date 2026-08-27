import { AlignmentActions } from "../config/types.js";
import { formatUniqueVersions } from "../diff/diff.js";
import { groupByChangeType } from "../diff/group.js";
import {
  type PackageChange,
} from "../diff/types.js";
import type { SecurityFinding } from "../security/classify.js";
import { META_VULN_TITLE } from "../security/npm-audit.js";
import { formatRefsMarkdown } from "../security/refs.js";
import {
  packageChangeCounts,
  policyIssueCount,
  SecuritySectionIntros,
  SecuritySectionTitles,
} from "./shared.js";
import type { StageReport } from "./types.js";

/**
 * Builds a markdown table for changed packages (from/to version columns).
 */
function formatChangedTable(changes: PackageChange[]): string {
  const rows = [
    "| Package | From Version | To Version |",
    "|---------|--------------|------------|",
  ];
  for (const change of changes) {
    rows.push(
      `| ${formatPackageName(change)} | \`${formatUniqueVersions(change.from)}\` | \`${formatUniqueVersions(change.to)}\` |`
    );
  }
  return rows.join("\n");
}

/**
 * Builds a single-column version table for added or removed packages.
 */
function formatSingleVersionTable(
  changes: PackageChange[],
  side: "from" | "to"
): string {
  const rows = ["| Package | Version |", "|---------|---------|"];
  for (const change of changes) {
    const versions =
      side === "to"
        ? formatUniqueVersions(change.to)
        : formatUniqueVersions(change.from);
    rows.push(`| ${formatPackageName(change)} | \`${versions}\` |`);
  }
  return rows.join("\n");
}

/**
 * Renders a package name as bold (direct) or italic (transitive).
 */
function formatPackageName(change: PackageChange): string {
  if (change.direct) {
    return `**${change.name}**`;
  }
  return `*${change.name}*`;
}

/**
 * Wraps content in a collapsed HTML details/summary block for GitHub-compatible markdown.
 */
function detailsBlock(summary: string, body: string): string {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

/**
 * Formats one list of changes into collapsible changed/added/removed blocks.
 */
function formatChangeGroups(changes: PackageChange[]): string {
  const byType = groupByChangeType(changes);
  const parts: string[] = [];
  if (byType.changed.length > 0) {
    parts.push(
      detailsBlock(
        `Changed Packages (${byType.changed.length})`,
        formatChangedTable(byType.changed)
      )
    );
  }
  if (byType.added.length > 0) {
    parts.push(
      detailsBlock(
        `Added Packages (${byType.added.length})`,
        formatSingleVersionTable(byType.added, "to")
      )
    );
  }
  if (byType.removed.length > 0) {
    parts.push(
      detailsBlock(
        `Removed Packages (${byType.removed.length})`,
        formatSingleVersionTable(byType.removed, "from")
      )
    );
  }
  return parts.join("\n\n");
}

/**
 * Splits changes into required vs optional/platform and renders both sections.
 */
function formatDependencyBucket(title: string, changes: PackageChange[]): string {
  if (changes.length === 0) {
    return "";
  }
  const required = changes.filter((change) => !change.optional);
  const optional = changes.filter((change) => change.optional);
  const parts = [`## ${title}`, ""];
  if (required.length > 0) {
    parts.push(formatChangeGroups(required));
  }
  if (optional.length > 0) {
    parts.push("");
    parts.push(`### Optional / platform (${optional.length})`);
    parts.push("");
    parts.push(formatChangeGroups(optional));
  }
  if (required.length === 0 && optional.length === 0) {
    return "";
  }
  return parts.join("\n");
}

/**
 * Formats References cell: advisory links, or a meta-vuln via label.
 */
function formatFindingReferences(finding: SecurityFinding): string {
  if (finding.refs.length > 0) {
    return formatRefsMarkdown(finding.refs);
  }
  if (finding.viaPackages && finding.viaPackages.length > 0) {
    const via = finding.viaPackages.map((name) => `\`${name}\``).join(", ");
    return `transitive (via ${via})`;
  }
  return "—";
}

/**
 * Formats a markdown section listing security findings.
 * Returns an empty string when there are no findings (section omitted).
 */
function formatFindings(
  title: string,
  intro: string,
  findings: SecurityFinding[]
): string {
  if (findings.length === 0) {
    return "";
  }
  const rows = [
    `### ${title} (${findings.length})`,
    "",
    intro,
    "",
    "| Severity | Title | References | Package |",
    "|----------|-------|------------|---------|",
    ...findings.map((item) => {
      const titleText = item.title?.trim() || "—";
      return `| ${item.severity} | ${titleText} | ${formatFindingReferences(item)} | \`${item.packageName}\` |`;
    }),
  ];
  return rows.join("\n");
}

/**
 * Joins non-empty security finding sections with blank lines between them.
 */
function formatSecuritySections(sections: string[]): string {
  return sections.filter((section) => section.length > 0).join("\n\n");
}

/**
 * Renders the top-of-report summary with package and security counts.
 */
function formatSummary(report: StageReport): string {
  const packages = packageChangeCounts(report);
  const { fixed, introduced, unresolved } = report.security;
  const policy = policyIssueCount(report);
  const lines = [
    "## Summary",
    "",
    `- Mode: \`${report.mode}\``,
    `- Strategy: \`${report.strategy}\``,
    `- Package manager: \`${report.packageManager}\``,
  ];
  if (report.beefupVersion) {
    lines.push(`- Beefup: \`${report.beefupVersion}\``);
  }
  if (report.generatedAt) {
    lines.push(`- Generated: \`${report.generatedAt}\``);
  }
  lines.push(
    `- Packages: **${packages.changed}** changed, **${packages.added}** added, **${packages.removed}** removed`,
    `- Security: **${introduced.length}** introduced, **${unresolved.length}** unresolved, **${fixed.length}** fixed`,
    `- Policy: ${policy === 0 ? "**no issues**" : `**${policy}** issue(s)`}`
  );
  if (introduced.length === 0) {
    lines.push("- No CVEs introduced by this staged upgrade");
  } else {
    lines.push(
      `- **Warning:** ${introduced.length} CVE(s) introduced — review before accept`
    );
  }
  return lines.join("\n");
}

/**
 * Renders the policy section.
 */
function formatPolicy(report: StageReport): string {
  const parts = ["## Policy", ""];
  if (policyIssueCount(report) === 0) {
    parts.push("No policy issues.");
    return parts.join("\n");
  }
  for (const item of report.ranges) {
    parts.push(`- **${item.severity}** ${item.message}`);
  }
  for (const item of report.overrides) {
    parts.push(`- **${AlignmentActions.Error}** [${item.override}] ${item.message}`);
  }
  for (const item of report.alignment) {
    parts.push(`- **${item.severity}** [${item.group}] ${item.message}`);
  }
  return parts.join("\n");
}

/**
 * Renders footer legend and path hints.
 */
function formatFooter(): string {
  return [
    "## Legend",
    "",
    "- **Bold** package names are direct dependencies (declared in a workspace `package.json`).",
    "- *Italic* package names are transitive.",
    "- **Optional / platform** sections list packages marked optional in the lockfile or `optionalDependencies` (still security-scanned).",
    `- Security rows titled “${META_VULN_TITLE}” are npm meta-vulns: the package has no advisory of its own but depends on a vulnerable package.`,
    "",
    "## Paths",
    "",
    "- Staged proposal: `.beefup/staged`",
    "- This report: `.beefup/report`",
  ].join("\n");
}

/**
 * Renders a stage report as markdown for files or stdout.
 * Order: Summary → Security (Introduced → Unresolved → Fixed) → Policy → package diffs → Warnings → Legend.
 */
export function renderMarkdown(report: StageReport): string {
  const parts: string[] = [
    "# Beefup upgrade report",
    "",
    formatSummary(report),
    "",
    "## Security",
    "",
    formatSecuritySections([
      formatFindings(
        SecuritySectionTitles.Introduced,
        SecuritySectionIntros.Introduced,
        report.security.introduced
      ),
      formatFindings(
        SecuritySectionTitles.Unresolved,
        SecuritySectionIntros.Unresolved,
        report.security.unresolved
      ),
      formatFindings(
        SecuritySectionTitles.Fixed,
        SecuritySectionIntros.Fixed,
        report.security.fixed
      ),
    ]) || "No security findings.",
    "",
    formatPolicy(report),
  ];

  const deps = formatDependencyBucket("Dependencies", report.diff.dependencies);
  if (deps) {
    parts.push("", deps);
  }
  const devDeps = formatDependencyBucket(
    "Dev Dependencies",
    report.diff.devDependencies
  );
  if (devDeps) {
    parts.push("", devDeps);
  }

  if (report.warnings.length > 0) {
    parts.push("", "## Warnings");
    for (const warning of report.warnings) {
      parts.push(`- ${warning}`);
    }
  }

  parts.push("", formatFooter());

  return `${parts.join("\n")}\n`;
}
