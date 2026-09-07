/** Closed set of public vulnerability reference kinds. */
export const AdvisoryRefKinds = {
  Cve: "cve",
  Ghsa: "ghsa",
  Osv: "osv",
} as const;

/** Kind of public advisory identifier (CVE, GHSA, or OSV). */
export type AdvisoryRefKind =
  (typeof AdvisoryRefKinds)[keyof typeof AdvisoryRefKinds];

/** A lookup-able vulnerability reference with a stable public URL. */
export interface AdvisoryRef {
  id: string;
  kind: AdvisoryRefKind;
  url: string;
}

const GHSA_RE = /\bGHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/i;
const CVE_RE = /\bCVE-\d{4}-\d+\b/i;
/** OSV ids mentioned inside free text (word-bounded). */
const OSV_RE = /\bOSV-[A-Za-z0-9._-]+\b/;
/** Full-string OSV id used for refs / URL path segments. */
const OSV_ID_RE = /^OSV-[A-Za-z0-9._-]+$/;

/**
 * Encodes a single URL path segment so attacker-controlled ids cannot break
 * out of the path or inject markdown / HTML into report links.
 * Extends encodeURIComponent to also percent-encode `()` (not encoded by default,
 * but they break markdown `[text](url)` links).
 */
function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * Builds the canonical GitHub Advisory Database URL for a GHSA id.
 */
export function urlForGhsa(id: string): string {
  return `https://github.com/advisories/${encodePathSegment(normalizeGhsa(id))}`;
}

/**
 * Builds the NVD detail URL for a CVE id.
 */
export function urlForCve(id: string): string {
  return `https://nvd.nist.gov/vuln/detail/${encodePathSegment(normalizeCve(id))}`;
}

/**
 * Builds the OSV.dev vulnerability URL for an OSV id.
 * Path-encodes the id so punctuation cannot break markdown links.
 */
export function urlForOsv(id: string): string {
  return `https://osv.dev/vulnerability/${encodePathSegment(id)}`;
}

/**
 * Normalizes a GHSA id to GHSA-… with lowercase suffix (GitHub canonical form).
 * Returns the original string when it does not contain a GHSA match.
 */
function normalizeGhsa(id: string): string {
  const match = id.match(GHSA_RE);
  if (!match) {
    return id;
  }
  return `GHSA-${match[0].slice(5).toLowerCase()}`;
}

/**
 * Normalizes a CVE id to CVE-YYYY-NNNN uppercase form.
 * Returns the original string when it does not contain a CVE match.
 */
function normalizeCve(id: string): string {
  const match = id.match(CVE_RE);
  if (!match) {
    return id;
  }
  return match[0].toUpperCase();
}

/**
 * True when the whole string is a canonical GHSA id.
 */
function isGhsaId(value: string): boolean {
  return /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(value);
}

/**
 * True when the whole string is a canonical CVE id.
 */
function isCveId(value: string): boolean {
  return /^CVE-\d{4}-\d+$/i.test(value);
}

/**
 * Creates an AdvisoryRef for a known id string, or undefined when unrecognized.
 * Only validated id shapes become refs (avoids markdown / URL injection via ids).
 */
export function refFromId(raw: string): AdvisoryRef | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (isGhsaId(value)) {
    const id = normalizeGhsa(value);
    return { id, kind: AdvisoryRefKinds.Ghsa, url: urlForGhsa(id) };
  }
  if (isCveId(value)) {
    const id = normalizeCve(value);
    return { id, kind: AdvisoryRefKinds.Cve, url: urlForCve(id) };
  }
  if (OSV_ID_RE.test(value)) {
    return { id: value, kind: AdvisoryRefKinds.Osv, url: urlForOsv(value) };
  }
  return undefined;
}

/**
 * Extracts GHSA/CVE/OSV ids mentioned in free text or a URL.
 */
export function refsFromText(text: string | undefined): AdvisoryRef[] {
  if (!text) {
    return [];
  }
  const found: AdvisoryRef[] = [];
  for (const match of text.matchAll(new RegExp(GHSA_RE, "gi"))) {
    const ref = refFromId(match[0]);
    if (ref) {
      found.push(ref);
    }
  }
  for (const match of text.matchAll(new RegExp(CVE_RE, "gi"))) {
    const ref = refFromId(match[0]);
    if (ref) {
      found.push(ref);
    }
  }
  for (const match of text.matchAll(new RegExp(OSV_RE, "g"))) {
    const ref = refFromId(match[0]);
    if (ref) {
      found.push(ref);
    }
  }
  return dedupeRefs(found);
}

/**
 * Collects refs from common scanner field shapes (string, string[], or nested).
 */
export function refsFromScannerFields(fields: {
  id?: unknown;
  cve?: unknown;
  ghsa?: unknown;
  osvId?: unknown;
  aliases?: unknown;
  url?: unknown;
}): AdvisoryRef[] {
  const collected: AdvisoryRef[] = [];
  for (const value of [
    fields.id,
    fields.cve,
    fields.ghsa,
    fields.osvId,
    fields.aliases,
    fields.url,
  ]) {
    for (const item of asStringList(value)) {
      const direct = refFromId(item);
      if (direct) {
        collected.push(direct);
      } else {
        collected.push(...refsFromText(item));
      }
    }
  }
  return dedupeRefs(collected);
}

/**
 * Dedupes refs by id, preserving first-seen order (GHSA/CVE/OSV as discovered).
 */
export function dedupeRefs(refs: AdvisoryRef[]): AdvisoryRef[] {
  const seen = new Set<string>();
  const out: AdvisoryRef[] = [];
  for (const ref of refs) {
    const key = ref.id.toUpperCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * Picks a stable primary finding id from refs, or a provided fallback.
 */
export function primaryFindingId(
  refs: AdvisoryRef[],
  fallback: string
): string {
  if (refs.length === 0) {
    return fallback;
  }
  const ghsa = refs.find((ref) => ref.kind === AdvisoryRefKinds.Ghsa);
  if (ghsa) {
    return ghsa.id;
  }
  const cve = refs.find((ref) => ref.kind === AdvisoryRefKinds.Cve);
  if (cve) {
    return cve.id;
  }
  return refs[0]?.id ?? fallback;
}

/**
 * Renders refs as markdown hyperlinks, comma-separated.
 */
export function formatRefsMarkdown(refs: AdvisoryRef[]): string {
  if (refs.length === 0) {
    return "—";
  }
  return refs.map((ref) => `[${ref.id}](${ref.url})`).join(", ");
}

/**
 * Renders refs as plain text ids, comma-separated (URLs omitted for terminal density).
 */
export function formatRefsText(refs: AdvisoryRef[]): string {
  if (refs.length === 0) {
    return "—";
  }
  return refs.map((ref) => ref.id).join(", ");
}

/**
 * Flattens unknown scanner values into a list of strings.
 */
function asStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => asStringList(item));
  }
  return [];
}
