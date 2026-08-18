import { PackageChangeType, type PackageChange } from "../diff/types.js";
import { groupByVersionChange } from "../diff/group.js";
import type { StageReport } from "./types.js";

function formatChange(change: PackageChange): string {
  switch (change.type) {
    case PackageChangeType.Added:
      return `  + ${change.name}@${change.toVersion}`;
    case PackageChangeType.Removed:
      return `  - ${change.name}@${change.fromVersion}`;
    case PackageChangeType.Upgraded:
      return `  ~ ${change.name}: ${change.fromVersion} → ${change.toVersion}`;
    case PackageChangeType.Downgraded:
      return `  ↓ ${change.name}: ${change.fromVersion} → ${change.toVersion} (downgraded)`;
  }
}

function formatChanges(title: string, changes: PackageChange[]): string[] {
  if (changes.length === 0) {
    return [];
  }
  const byType = groupByVersionChange(changes);
  const parts = [title];
  const sections: Array<[string, PackageChange[]]> = [
    ["Major Updates", byType.major],
    ["Minor Updates", byType.minor],
    ["Patch Updates", byType.patch],
    ["Added Packages", byType.added],
    ["Removed Packages", byType.removed],
    ["Downgraded Packages", byType.downgraded],
  ];
  for (const [label, list] of sections) {
    if (list.length === 0) {
      continue;
    }
    parts.push(`${label}:`);
    parts.push(...list.map((item) => formatChange(item)));
  }
  return parts;
}

export function renderText(report: StageReport): string {
  const parts = [
    `Beefup stage (${report.packageManager}, mode=${report.mode}, strategy=${report.strategy})`,
    ...formatChanges("DEPENDENCIES", report.diff.dependencies),
    ...formatChanges("DEV DEPENDENCIES", report.diff.devDependencies),
    "",
    `Security: ${report.security.fixed.length} fixed, ${report.security.introduced.length} introduced, ${report.security.retained.length} retained`,
  ];

  if (report.security.introduced.length > 0) {
    parts.push("Introduced:");
    for (const item of report.security.introduced) {
      parts.push(
        `  ! ${item.severity} ${item.id} ${item.packageName} (${item.source})`
      );
    }
  }

  for (const item of report.ranges.filter((finding) => finding.severity === "error")) {
    parts.push(`error: ${item.message}`);
  }
  for (const item of report.overrides) {
    parts.push(`error: [${item.override}] ${item.message}`);
  }
  for (const item of report.alignment.filter((finding) => finding.severity === "error")) {
    parts.push(`error: [${item.group}] ${item.message}`);
  }
  for (const warning of report.warnings) {
    parts.push(`warning: ${warning}`);
  }

  return `${parts.filter((line) => line !== "").join("\n")}\n`;
}
