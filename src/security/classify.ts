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
  id: string;
  packageName: string;
  version?: string;
  severity: FindingSeverity;
  source: SecuritySource;
  title?: string;
}

export interface ClassifiedFindings {
  fixed: SecurityFinding[];
  introduced: SecurityFinding[];
  retained: SecurityFinding[];
}

const SEVERITY_ORDER: FindingSeverity[] = [
  FindingSeverities.Critical,
  FindingSeverities.High,
  FindingSeverities.Moderate,
  FindingSeverities.Low,
  FindingSeverities.Info,
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
 * Classifies findings as fixed, introduced, or retained by comparing before/after scans.
 */
export function classifyFindings(
  before: SecurityFinding[],
  after: SecurityFinding[]
): ClassifiedFindings {
  const beforeMap = new Map(before.map((item) => [findingKey(item), item]));
  const afterMap = new Map(after.map((item) => [findingKey(item), item]));
  const fixed: SecurityFinding[] = [];
  const introduced: SecurityFinding[] = [];
  const retained: SecurityFinding[] = [];

  for (const [key, finding] of beforeMap) {
    if (afterMap.has(key)) {
      retained.push(afterMap.get(key) ?? finding);
    } else {
      fixed.push(finding);
    }
  }
  for (const [key, finding] of afterMap) {
    if (!beforeMap.has(key)) {
      introduced.push(finding);
    }
  }

  return {
    fixed: sortFindings(fixed),
    introduced: sortFindings(introduced),
    retained: sortFindings(retained),
  };
}
