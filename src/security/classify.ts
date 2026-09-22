import { dedupeRefs, type AdvisoryRef } from "./refs.js";

/** Closed set of vulnerability severities used in security reports. */
export const FindingSeverities = {
  Critical: "critical",
  High: "high",
  Moderate: "moderate",
  Low: "low",
  Info: "info",
} as const;

/** Severity level for a security finding. */
export type FindingSeverity =
  (typeof FindingSeverities)[keyof typeof FindingSeverities];

/** Closed set of scanners that can produce a security finding. */
export const SecuritySources = {
  NpmAudit: "npm-audit",
  CveLite: "cve-lite",
} as const;

/** Scanner that produced a security finding. */
export type SecuritySource =
  (typeof SecuritySources)[keyof typeof SecuritySources];

export interface SecurityFinding {
  /** Primary identity for classification (prefer GHSA, then CVE, then OSV). */
  id: string;
  /** Public CVE / GHSA / OSV references for this vulnerability. */
  refs: AdvisoryRef[];
  /**
   * Parent package names when this row is an npm meta-vuln (via strings only).
   * Empty/undefined for findings with real advisory objects.
   */
  viaPackages?: string[];
  packageName: string;
  version?: string;
  severity: FindingSeverity;
  /** Scanners that reported this finding (more than one when they share an id). */
  sources: SecuritySource[];
  title?: string;
}

export interface ClassifiedFindings {
  fixed: SecurityFinding[];
  introduced: SecurityFinding[];
  /** Present before and after the upgrade — still open / unfixed. */
  unresolved: SecurityFinding[];
}

const SEVERITY_ORDER: FindingSeverity[] = [
  FindingSeverities.Critical,
  FindingSeverities.High,
  FindingSeverities.Moderate,
  FindingSeverities.Low,
  FindingSeverities.Info,
];

/** Canonical scanner order for merged `sources` lists in reports. */
const SOURCE_ORDER: SecuritySource[] = [
  SecuritySources.NpmAudit,
  SecuritySources.CveLite,
];

/**
 * Maps a raw severity string from a scanner into a normalized FindingSeverity.
 */
export function normalizeSeverity(raw: string | undefined): FindingSeverity {
  const value = (raw ?? FindingSeverities.Info).toLowerCase();
  if (value === FindingSeverities.Critical) {
    return FindingSeverities.Critical;
  }
  if (value === FindingSeverities.High) {
    return FindingSeverities.High;
  }
  if (value === FindingSeverities.Moderate || value === "medium") {
    return FindingSeverities.Moderate;
  }
  if (value === FindingSeverities.Low) {
    return FindingSeverities.Low;
  }
  return FindingSeverities.Info;
}

/**
 * True when this row is an npm meta-vuln: no advisory of its own, only via packages.
 */
export function isMetaFinding(finding: SecurityFinding): boolean {
  return (
    finding.refs.length === 0 &&
    finding.sources.includes(SecuritySources.NpmAudit) &&
    (finding.viaPackages?.length ?? 0) > 0
  );
}

/**
 * Sorts scanner names into a stable report order.
 */
function sortSources(sources: SecuritySource[]): SecuritySource[] {
  return [...new Set(sources)].sort(
    (a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b)
  );
}

/**
 * Picks the more severe of two finding severities.
 */
function worseSeverity(a: FindingSeverity, b: FindingSeverity): FindingSeverity {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * Prefers a non-empty title; if both exist, keeps the longer description.
 */
function pickTitle(left?: string, right?: string): string | undefined {
  const a = left?.trim() ?? "";
  const b = right?.trim() ?? "";
  if (!a) {
    return b || undefined;
  }
  if (!b) {
    return a;
  }
  return a.length >= b.length ? a : b;
}

/**
 * Merges two findings that share an id and package name.
 * Unions scanners and refs instead of letting the later scanner overwrite.
 */
function mergeFinding(a: SecurityFinding, b: SecurityFinding): SecurityFinding {
  const via = [
    ...new Set([...(a.viaPackages ?? []), ...(b.viaPackages ?? [])]),
  ].sort((left, right) => left.localeCompare(right));
  return {
    id: a.id,
    refs: dedupeRefs([...a.refs, ...b.refs]),
    viaPackages: via.length > 0 ? via : undefined,
    packageName: a.packageName,
    version: a.version ?? b.version,
    severity: worseSeverity(a.severity, b.severity),
    sources: sortSources([...a.sources, ...b.sources]),
    title: pickTitle(a.title, b.title),
  };
}

/**
 * Collapses findings with the same id and package, recording every scanner.
 */
export function mergeFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const map = new Map<string, SecurityFinding>();
  for (const item of findings) {
    const key = findingKey(item);
    const existing = map.get(key);
    map.set(key, existing ? mergeFinding(existing, item) : item);
  }
  return [...map.values()];
}

/**
 * Builds a stable identity key for a finding (id + package name).
 */
function findingKey(finding: SecurityFinding): string {
  return `${finding.id}::${finding.packageName}`;
}

/**
 * Sorts findings by severity (highest first), then by identity key.
 */
function sortFindings(findings: SecurityFinding[]): SecurityFinding[] {
  return [...findings].sort((a, b) => {
    const severity =
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (severity !== 0) {
      return severity;
    }
    return findingKey(a).localeCompare(findingKey(b));
  });
}

/**
 * Classifies findings as fixed, introduced, or unresolved by comparing before/after scans.
 * Parent meta-vulns count as introduced only when they wrap a newly introduced leaf advisory.
 */
export function classifyFindings(
  before: SecurityFinding[],
  after: SecurityFinding[]
): ClassifiedFindings {
  const beforeMap = new Map(
    mergeFindings(before).map((item) => [findingKey(item), item])
  );
  const afterMap = new Map(
    mergeFindings(after).map((item) => [findingKey(item), item])
  );
  const fixed: SecurityFinding[] = [];
  const introduced: SecurityFinding[] = [];
  const unresolved: SecurityFinding[] = [];

  for (const [key, finding] of beforeMap) {
    if (afterMap.has(key)) {
      unresolved.push(afterMap.get(key) ?? finding);
    } else {
      fixed.push(finding);
    }
  }
  for (const [key, finding] of afterMap) {
    if (!beforeMap.has(key)) {
      introduced.push(finding);
    }
  }

  return reclassifyMetaIntroduced({
    fixed: sortFindings(fixed),
    introduced: sortFindings(introduced),
    unresolved: sortFindings(unresolved),
  });
}

/**
 * Moves introduced meta-vulns that only wrap already-known advisories into unresolved.
 * npm audit re-parents the same leaf issues onto unchanged packages when a dependency
 * finding changes shape (advisory → "depends on vulnerable package(s)").
 */
function reclassifyMetaIntroduced(result: ClassifiedFindings): ClassifiedFindings {
  const introducedLeaves = new Set(
    result.introduced
      .filter((item) => !isMetaFinding(item))
      .map((item) => item.packageName)
  );
  const viaByPackage = new Map<string, string[]>();
  for (const item of [...result.introduced, ...result.unresolved]) {
    if (isMetaFinding(item) && item.viaPackages) {
      viaByPackage.set(item.packageName, item.viaPackages);
    }
  }

  const stillIntroduced: SecurityFinding[] = [];
  const moved: SecurityFinding[] = [];
  for (const item of result.introduced) {
    if (
      !isMetaFinding(item) ||
      reachesIntroducedLeaf(item.packageName, introducedLeaves, viaByPackage)
    ) {
      stillIntroduced.push(item);
    } else {
      moved.push(item);
    }
  }

  return {
    fixed: result.fixed,
    introduced: sortFindings(stillIntroduced),
    unresolved: sortFindings([...result.unresolved, ...moved]),
  };
}

/**
 * True when `packageName` is a newly introduced leaf advisory, or a meta-vuln
 * whose via-chain reaches one (directly or through other meta-vulns).
 */
function reachesIntroducedLeaf(
  packageName: string,
  introducedLeaves: ReadonlySet<string>,
  viaByPackage: ReadonlyMap<string, string[]>,
  seen: Set<string> = new Set()
): boolean {
  if (introducedLeaves.has(packageName)) {
    return true;
  }
  if (seen.has(packageName)) {
    return false;
  }
  seen.add(packageName);
  const vias = viaByPackage.get(packageName);
  if (!vias) {
    return false;
  }
  return vias.some((via) =>
    reachesIntroducedLeaf(via, introducedLeaves, viaByPackage, seen)
  );
}
