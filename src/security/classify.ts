export type FindingSeverity = "critical" | "high" | "moderate" | "low" | "info";

export interface SecurityFinding {
  id: string;
  packageName: string;
  version?: string;
  severity: FindingSeverity;
  source: "npm-audit" | "cve-lite";
  title?: string;
}

export interface ClassifiedFindings {
  fixed: SecurityFinding[];
  introduced: SecurityFinding[];
  retained: SecurityFinding[];
}

const SEVERITY_ORDER: FindingSeverity[] = [
  "critical",
  "high",
  "moderate",
  "low",
  "info",
];

export function normalizeSeverity(raw: string | undefined): FindingSeverity {
  const value = (raw ?? "info").toLowerCase();
  if (value === "critical") {
    return "critical";
  }
  if (value === "high") {
    return "high";
  }
  if (value === "moderate" || value === "medium") {
    return "moderate";
  }
  if (value === "low") {
    return "low";
  }
  return "info";
}

function findingKey(finding: SecurityFinding): string {
  return `${finding.id}::${finding.packageName}`;
}

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
