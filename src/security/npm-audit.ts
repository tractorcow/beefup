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

/** npm v6 / pnpm `pnpm audit --json` advisory object. */
interface NpmV6Advisory {
  id?: number | string;
  title?: string;
  module_name?: string;
  severity?: string;
  github_advisory_id?: string;
  url?: string;
  cves?: string[];
  findings?: Array<{ version?: string }>;
}

interface NpmAuditReport {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
  advisories?: Record<string, NpmV6Advisory>;
}

/** Title used for npm meta-vulns that only depend on other vulnerable packages. */
export const META_VULN_TITLE = "Depends on vulnerable package(s)";

/**
 * Parses npm v7-style `vulnerabilities` map entries into SecurityFinding rows.
 */
function findingsFromVulnerabilities(
  vulnerabilities: Record<string, NpmAuditVulnerability>
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const [packageName, vuln] of Object.entries(vulnerabilities)) {
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
        sources: [SecuritySources.NpmAudit],
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
        sources: [SecuritySources.NpmAudit],
        title: via.title,
      });
    }
  }
  return findings;
}

/**
 * Parses npm v6 / pnpm `advisories` map entries into SecurityFinding rows.
 */
function findingsFromAdvisories(
  advisories: Record<string, NpmV6Advisory>
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const advisory of Object.values(advisories)) {
    const packageName = advisory.module_name;
    if (!packageName) {
      continue;
    }
    const refs = dedupeRefs([
      ...refsFromText(advisory.github_advisory_id),
      ...refsFromText(advisory.url),
      ...(advisory.cves ?? []).flatMap((item) => refsFromText(item)),
      ...refsFromText(advisory.title),
    ]);
    const version = advisory.findings?.find(
      (item) => typeof item.version === "string"
    )?.version;
    const fallback =
      advisory.github_advisory_id ??
      (advisory.id !== undefined ? `npm:${advisory.id}` : packageName);
    findings.push({
      id: primaryFindingId(refs, String(fallback)),
      refs,
      packageName,
      version,
      severity: normalizeSeverity(advisory.severity),
      sources: [SecuritySources.NpmAudit],
      title: advisory.title,
    });
  }
  return findings;
}

/**
 * Parses `npm audit --json` or `pnpm audit --json` into normalized findings.
 * Supports npm v7 `vulnerabilities` maps and the npm v6 / pnpm `advisories` map.
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
  return [
    ...findingsFromVulnerabilities(parsed.vulnerabilities ?? {}),
    ...findingsFromAdvisories(parsed.advisories ?? {}),
  ];
}
