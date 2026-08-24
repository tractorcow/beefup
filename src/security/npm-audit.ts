import {
  normalizeSeverity,
  SecuritySources,
  type SecurityFinding,
} from "./classify.js";

interface NpmAuditVia {
  source?: number | string;
  name?: string;
  title?: string;
  severity?: string;
  url?: string;
}

interface NpmAuditVulnerability {
  name?: string;
  severity?: string;
  via?: Array<NpmAuditVia | string>;
  nodes?: string[];
}

interface NpmAuditReport {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

/**
 * Parses `npm audit --json` output into normalized SecurityFinding entries.
 * Returns an empty list when the payload is not valid JSON.
 */
export function parseNpmAuditJson(raw: string): SecurityFinding[] {
  let parsed: NpmAuditReport;
  try {
    parsed = JSON.parse(raw) as NpmAuditReport;
  } catch {
    return [];
  }
  const findings: SecurityFinding[] = [];
  for (const [packageName, vuln] of Object.entries(parsed.vulnerabilities ?? {})) {
    const vias = Array.isArray(vuln.via) ? vuln.via : [];
    const advisoryVias = vias.filter(
      (item): item is NpmAuditVia => typeof item === "object" && item !== null
    );
    if (advisoryVias.length === 0) {
      findings.push({
        id: `npm:${packageName}`,
        packageName: vuln.name ?? packageName,
        severity: normalizeSeverity(vuln.severity),
        source: SecuritySources.NpmAudit,
        title: packageName,
      });
      continue;
    }
    for (const via of advisoryVias) {
      const id =
        via.source !== undefined
          ? String(via.source)
          : via.url ?? via.title ?? packageName;
      findings.push({
        id,
        packageName: via.name ?? vuln.name ?? packageName,
        severity: normalizeSeverity(via.severity ?? vuln.severity),
        source: SecuritySources.NpmAudit,
        title: via.title,
      });
    }
  }
  return findings;
}
