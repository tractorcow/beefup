import { AlignmentActions } from "../config/types.js";
import { formatUniqueVersions } from "../diff/diff.js";
import { groupByChangeType } from "../diff/group.js";
import { type PackageChange } from "../diff/types.js";
import type { SecurityFinding } from "../security/classify.js";
import { META_VULN_TITLE } from "../security/npm-audit.js";
import {
  packageChangeCounts,
  policyIssueCount,
  SecuritySectionIntros,
  SecuritySectionTitles,
} from "./shared.js";
import type { StageReport } from "./types.js";

/**
 * Escapes text for HTML element content and quoted attributes.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * CSS class suffix for a finding or policy severity (`sev-high`, `sev-error`, …).
 */
function severityClass(severity: string): string {
  return `sev-${severity}`;
}

/**
 * Renders a package name as strong (direct) or em (transitive).
 */
function formatPackageName(change: PackageChange): string {
  const name = escapeHtml(change.name);
  if (change.direct) {
    return `<strong>${name}</strong>`;
  }
  return `<em>${name}</em>`;
}

/**
 * Wraps unique version tags in a from or to colour span, leaving empty marks plain.
 */
function formatVersionHtml(versions: string, side: "from" | "to"): string {
  const escaped = escapeHtml(versions);
  if (versions.length === 0 || versions === "—") {
    return escaped;
  }
  return `<span class="ver-${side}">${escaped}</span>`;
}

/**
 * Renders advisory links, or a meta-vuln via label.
 */
function formatFindingReferences(finding: SecurityFinding): string {
  if (finding.refs.length > 0) {
    return finding.refs
      .map(
        (ref) =>
          `<a href="${escapeHtml(ref.url)}">${escapeHtml(ref.id)}</a>`
      )
      .join(", ");
  }
  if (finding.viaPackages && finding.viaPackages.length > 0) {
    const via = finding.viaPackages
      .map((name) => `<code>${escapeHtml(name)}</code>`)
      .join(", ");
    return `transitive (via ${via})`;
  }
  return "—";
}

/**
 * Builds an HTML table for changed packages (from/to version columns).
 */
function formatChangedTable(changes: PackageChange[]): string {
  const rows = changes.map((change) => {
    return `<tr><td>${formatPackageName(change)}</td><td>${formatVersionHtml(formatUniqueVersions(change.from), "from")}</td><td>${formatVersionHtml(formatUniqueVersions(change.to), "to")}</td></tr>`;
  });
  return `<table><thead><tr><th>Package</th><th>From</th><th>To</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

/**
 * Builds a single-column version table for added or removed packages.
 */
function formatSingleVersionTable(
  changes: PackageChange[],
  side: "from" | "to"
): string {
  const rows = changes.map((change) => {
    const versions =
      side === "to"
        ? formatUniqueVersions(change.to)
        : formatUniqueVersions(change.from);
    return `<tr><td>${formatPackageName(change)}</td><td>${formatVersionHtml(versions, side)}</td></tr>`;
  });
  return `<table><thead><tr><th>Package</th><th>Version</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

/**
 * Formats one list of changes into collapsible changed/added/removed blocks.
 */
function formatChangeGroups(changes: PackageChange[]): string {
  const byType = groupByChangeType(changes);
  const parts: string[] = [];
  if (byType.changed.length > 0) {
    parts.push(
      `<details open><summary>Changed Packages (${byType.changed.length})</summary>${formatChangedTable(byType.changed)}</details>`
    );
  }
  if (byType.added.length > 0) {
    parts.push(
      `<details open><summary>Added Packages (${byType.added.length})</summary>${formatSingleVersionTable(byType.added, "to")}</details>`
    );
  }
  if (byType.removed.length > 0) {
    parts.push(
      `<details open><summary>Removed Packages (${byType.removed.length})</summary>${formatSingleVersionTable(byType.removed, "from")}</details>`
    );
  }
  return parts.join("");
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
  const parts = [`<h2>${escapeHtml(title)}</h2>`];
  if (required.length > 0) {
    parts.push(formatChangeGroups(required));
  }
  if (optional.length > 0) {
    parts.push(
      `<h3>Optional / platform (${optional.length})</h3>`,
      formatChangeGroups(optional)
    );
  }
  return parts.join("");
}

/**
 * Formats an HTML section listing security findings.
 */
function formatFindings(
  title: string,
  intro: string,
  findings: SecurityFinding[],
  kind: "introduced" | "unresolved" | "fixed"
): string {
  if (findings.length === 0) {
    return "";
  }
  const rows = findings.map((item) => {
    const titleText = item.title?.trim() || "—";
    return `<tr><td><span class="badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span></td><td>${escapeHtml(titleText)}</td><td>${formatFindingReferences(item)}</td><td><code>${escapeHtml(item.packageName)}</code></td></tr>`;
  });
  return `<section class="findings ${kind}"><h3>${escapeHtml(title)} (${findings.length})</h3><p>${escapeHtml(intro)}</p><table><thead><tr><th>Severity</th><th>Title</th><th>References</th><th>Package</th></tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
}

/**
 * Renders the top-of-report summary with package and security counts.
 */
function formatSummary(report: StageReport): string {
  const packages = packageChangeCounts(report);
  const { fixed, introduced, unresolved } = report.security;
  const policy = policyIssueCount(report);
  const items = [
    `<li>Mode: <code>${escapeHtml(report.mode)}</code></li>`,
    `<li>Strategy: <code>${escapeHtml(report.strategy)}</code></li>`,
    `<li>Package manager: <code>${escapeHtml(report.packageManager)}</code></li>`,
  ];
  if (report.beefupVersion) {
    items.push(`<li>Beefup: <code>${escapeHtml(report.beefupVersion)}</code></li>`);
  }
  if (report.generatedAt) {
    items.push(`<li>Generated: <code>${escapeHtml(report.generatedAt)}</code></li>`);
  }
  items.push(
    `<li>Packages: <strong>${packages.changed}</strong> changed, <strong>${packages.added}</strong> added, <strong>${packages.removed}</strong> removed</li>`,
    `<li>Security: <strong class="ver-from">${introduced.length}</strong> introduced, <strong class="unresolved-count">${unresolved.length}</strong> unresolved, <strong class="ver-to">${fixed.length}</strong> fixed</li>`,
    `<li>Policy: ${policy === 0 ? "<strong>no issues</strong>" : `<strong>${policy}</strong> issue(s)`}</li>`
  );
  if (introduced.length === 0) {
    items.push("<li>No CVEs introduced by this staged upgrade</li>");
  } else {
    items.push(
      `<li class="warn">Warning: ${introduced.length} CVE(s) introduced — review before accept</li>`
    );
  }
  return `<section><h2>Summary</h2><ul>${items.join("")}</ul></section>`;
}

/**
 * Renders the policy section.
 */
function formatPolicy(report: StageReport): string {
  if (policyIssueCount(report) === 0) {
    return `<section><h2>Policy</h2><p>No policy issues.</p></section>`;
  }
  const items: string[] = [];
  for (const item of report.ranges) {
    items.push(
      `<li><span class="badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span> ${escapeHtml(item.message)}</li>`
    );
  }
  for (const item of report.overrides) {
    items.push(
      `<li><span class="badge ${severityClass(AlignmentActions.Error)}">${escapeHtml(AlignmentActions.Error)}</span> [${escapeHtml(item.override)}] ${escapeHtml(item.message)}</li>`
    );
  }
  for (const item of report.alignment) {
    items.push(
      `<li><span class="badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span> [${escapeHtml(item.group)}] ${escapeHtml(item.message)}</li>`
    );
  }
  return `<section><h2>Policy</h2><ul>${items.join("")}</ul></section>`;
}

/**
 * Embedded stylesheet for the HTML report (severity colours and version diffs).
 */
function reportStyles(): string {
  return `
:root { color-scheme: light dark; --bg: #f6f7f9; --fg: #1b1f24; --card: #fff; --muted: #5c6570; --line: #d8dee6; --from: #c62828; --to: #2e7d32; --warn: #c62828; --unresolved: #f9a825; }
@media (prefers-color-scheme: dark) { :root { --bg: #12151a; --fg: #e8eaed; --card: #1c2128; --muted: #9aa3ad; --line: #30363d; --from: #ff8a80; --to: #81c784; --warn: #ff8a80; --unresolved: #ffd54f; } }
html { font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--fg); }
body { margin: 0; }
main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
h1, h2, h3 { line-height: 1.25; }
h1 { font-size: 1.6rem; }
section, details { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.1rem; margin: 1rem 0; }
.findings.introduced { border-left: 4px solid var(--from); }
.findings.unresolved { border-left: 4px solid var(--unresolved); }
.findings.fixed { border-left: 4px solid var(--to); }
.warn { color: var(--warn); font-weight: 600; }
.ver-from { color: var(--from); text-decoration: line-through; }
.ver-to { color: var(--to); font-weight: 600; }
.unresolved-count { color: var(--unresolved); }
table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
.badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
.sev-critical { background: #6a1b9a; color: #fff; }
.sev-high { background: #c62828; color: #fff; }
.sev-moderate { background: #f9a825; color: #111; }
.sev-low { background: #1565c0; color: #fff; }
.sev-info { background: #546e7a; color: #fff; }
.sev-error { background: #c62828; color: #fff; }
.sev-warn { background: #f9a825; color: #111; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
a { color: inherit; }
footer { color: var(--muted); font-size: 0.9rem; }
`.trim();
}

/**
 * Renders footer legend and path hints.
 */
function formatFooter(): string {
  return `<footer><h2>Legend</h2><ul><li><strong>Bold</strong> package names are direct dependencies (declared in a workspace <code>package.json</code>).</li><li><em>Italic</em> package names are transitive.</li><li><strong>Optional / platform</strong> sections list packages marked optional in the lockfile or <code>optionalDependencies</code> (still security-scanned).</li><li>Security rows titled “${escapeHtml(META_VULN_TITLE)}” are npm meta-vulns: the package has no advisory of its own but depends on a vulnerable package.</li></ul><h2>Paths</h2><ul><li>Staged proposal: <code>.beefup/staged</code></li><li>This report: <code>.beefup/report</code></li></ul></footer>`;
}

/**
 * Renders a stage report as a self-contained HTML document.
 * Uses colour for severity badges and from/to version comparisons.
 */
export function renderHtml(report: StageReport): string {
  const security = [
    formatFindings(
      SecuritySectionTitles.Introduced,
      SecuritySectionIntros.Introduced,
      report.security.introduced,
      "introduced"
    ),
    formatFindings(
      SecuritySectionTitles.Unresolved,
      SecuritySectionIntros.Unresolved,
      report.security.unresolved,
      "unresolved"
    ),
    formatFindings(
      SecuritySectionTitles.Fixed,
      SecuritySectionIntros.Fixed,
      report.security.fixed,
      "fixed"
    ),
  ]
    .filter((section) => section.length > 0)
    .join("") || "<p>No security findings.</p>";

  const deps = formatDependencyBucket("Dependencies", report.diff.dependencies);
  const devDeps = formatDependencyBucket(
    "Dev Dependencies",
    report.diff.devDependencies
  );

  let warnings = "";
  if (report.warnings.length > 0) {
    const items = report.warnings
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("");
    warnings = `<section><h2>Warnings</h2><ul>${items}</ul></section>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Beefup upgrade report</title>
<style>${reportStyles()}</style>
</head>
<body>
<main>
<h1>Beefup upgrade report</h1>
${formatSummary(report)}
<section><h2>Security</h2>${security}</section>
${formatPolicy(report)}
${deps}
${devDeps}
${warnings}
${formatFooter()}
</main>
</body>
</html>
`;
}
