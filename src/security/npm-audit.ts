import {
  normalizeSeverity,
  SecuritySources,
  type SecurityFinding,
} from "./classify.js";
import { primaryFindingId, dedupeRefs, refsFromText } from "./refs.js";

interface NpmAuditVia {
  source?: number | string;
  name?: string;
  title?: string;
  severity?: string;
  url?: string;
  cve?: string | string[];
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

/** Title used for npm meta-vulns that only depend on other vulnerable packages. */
export const META_VULN_TITLE = "Depends on vulnerable package(s)";

/**
 * Parses `npm audit --json` output into normalized SecurityFinding entries.
 * Prefers GHSA/CVE refs extracted from advisory URLs over numeric npm advisory ids.
 * Meta-vulns (via package-name strings only) are kept with viaPackages labels.
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
    const viaPackages = vias
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .sort((a, b) => a.localeCompare(b));

    if (advisoryVias.length === 0) {
      const fallback = `npm:${packageName}`;
      findings.push({
        id: fallback,
        refs: [],
        viaPackages: viaPackages.length > 0 ? viaPackages : undefined,
        packageName: vuln.name ?? packageName,
        severity: normalizeSeverity(vuln.severity),
        source: SecuritySources.NpmAudit,
        title: META_VULN_TITLE,
      });
      continue;
    }
    for (const via of advisoryVias) {
      const refs = dedupeRefs([
        ...refsFromText(via.url),
        ...refsFromText(typeof via.cve === "string" ? via.cve : undefined),
        ...(Array.isArray(via.cve)
          ? via.cve.flatMap((item) => refsFromText(item))
          : []),
        ...refsFromText(via.title),
      ]);
      const fallback =
        via.source !== undefined
          ? `npm:${via.source}`
          : via.url ?? via.title ?? packageName;
      findings.push({
        id: primaryFindingId(refs, fallback),
        refs,
        packageName: via.name ?? vuln.name ?? packageName,
        severity: normalizeSeverity(via.severity ?? vuln.severity),
        source: SecuritySources.NpmAudit,
        title: via.title,
      });
    }
  }
  return findings;
}
