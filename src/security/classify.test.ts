import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFindings,
  mergeFindings,
  FindingSeverities,
  SecuritySources,
  type SecurityFinding,
} from "./classify.js";
import { META_VULN_TITLE } from "./npm-audit.js";
import { AdvisoryRefKinds } from "./refs.js";

/**
 * Builds a leaf advisory finding for classification tests.
 */
function leafFinding(
  id: string,
  packageName: string,
  severity = FindingSeverities.Moderate
): SecurityFinding {
  return {
    id,
    refs: [],
    packageName,
    severity,
    sources: [SecuritySources.NpmAudit],
    title: id,
  };
}

/**
 * Builds an npm meta-vuln finding for classification tests.
 */
function metaFinding(
  packageName: string,
  viaPackages: string[],
  severity = FindingSeverities.Moderate
): SecurityFinding {
  return {
    id: `npm:${packageName}`,
    refs: [],
    viaPackages,
    packageName,
    severity,
    sources: [SecuritySources.NpmAudit],
    title: META_VULN_TITLE,
  };
}

describe("classifyFindings", () => {
  it("splits fixed, introduced, and unresolved CVEs by id and package", () => {
    const result = classifyFindings(
      [
        {
          id: "CVE-1",
          refs: [],
          packageName: "a",
          severity: FindingSeverities.High,
          sources: [SecuritySources.NpmAudit],
        },
        {
          id: "CVE-2",
          refs: [],
          packageName: "b",
          severity: FindingSeverities.Low,
          sources: [SecuritySources.CveLite],
        },
      ],
      [
        {
          id: "CVE-2",
          refs: [],
          packageName: "b",
          severity: FindingSeverities.Low,
          sources: [SecuritySources.CveLite],
        },
        {
          id: "CVE-3",
          refs: [],
          packageName: "c",
          severity: FindingSeverities.Critical,
          sources: [SecuritySources.NpmAudit],
        },
      ]
    );
    assert.deepEqual(
      result.fixed.map((item) => item.id),
      ["CVE-1"]
    );
    assert.deepEqual(
      result.introduced.map((item) => item.id),
      ["CVE-3"]
    );
    assert.deepEqual(
      result.unresolved.map((item) => item.id),
      ["CVE-2"]
    );
    assert.equal(result.introduced[0].severity, FindingSeverities.Critical);
  });

  it("does not treat parent meta-vulns as introduced when they only wrap unresolved advisories", () => {
    const result = classifyFindings(
      [leafFinding("GHSA-old", "react-router")],
      [
        leafFinding("GHSA-old", "react-router"),
        metaFinding("react-router-dom", ["react-router"]),
        metaFinding("@amicaldo/strapi-google-maps", [
          "@strapi/strapi",
          "react-router-dom",
        ]),
        metaFinding("@strapi/strapi", ["react-router-dom"]),
      ]
    );
    assert.deepEqual(
      result.introduced.map((item) => item.packageName),
      []
    );
    assert.deepEqual(
      result.unresolved.map((item) => item.packageName).sort(),
      [
        "@amicaldo/strapi-google-maps",
        "@strapi/strapi",
        "react-router",
        "react-router-dom",
      ]
    );
  });

  it("keeps a parent meta-vuln as introduced when a via package has a new leaf advisory", () => {
    const result = classifyFindings(
      [],
      [
        leafFinding("CVE-new", "lodash", FindingSeverities.High),
        metaFinding("my-app", ["lodash"], FindingSeverities.High),
      ]
    );
    assert.deepEqual(
      result.introduced.map((item) => item.packageName),
      ["lodash", "my-app"]
    );
    assert.deepEqual(result.unresolved, []);
  });

  it("keeps nested meta-vulns introduced when the via-chain reaches a new leaf", () => {
    const result = classifyFindings(
      [],
      [
        leafFinding("CVE-new", "lodash"),
        metaFinding("mid", ["lodash"]),
        metaFinding("app", ["mid"]),
      ]
    );
    assert.deepEqual(
      result.introduced.map((item) => item.packageName),
      ["lodash", "app", "mid"]
    );
  });

  it("records both scanners when the same id is reported twice", () => {
    const result = classifyFindings(
      [
        {
          id: "GHSA-fx2h-pf6j-xcff",
          refs: [],
          packageName: "vite",
          severity: FindingSeverities.High,
          sources: [SecuritySources.NpmAudit],
          title: "audit title",
        },
        {
          id: "GHSA-fx2h-pf6j-xcff",
          refs: [],
          packageName: "vite",
          severity: FindingSeverities.High,
          sources: [SecuritySources.CveLite],
          title: "cve-lite longer advisory title",
        },
      ],
      [
        {
          id: "GHSA-fx2h-pf6j-xcff",
          refs: [],
          packageName: "vite",
          severity: FindingSeverities.High,
          sources: [SecuritySources.CveLite],
        },
        {
          id: "GHSA-fx2h-pf6j-xcff",
          refs: [],
          packageName: "vite",
          severity: FindingSeverities.High,
          sources: [SecuritySources.NpmAudit],
        },
      ]
    );
    assert.equal(result.unresolved.length, 1);
    assert.deepEqual(result.unresolved[0]?.sources, [
      SecuritySources.NpmAudit,
      SecuritySources.CveLite,
    ]);
    assert.equal(result.fixed.length, 0);
    assert.equal(result.introduced.length, 0);
  });
});

describe("mergeFindings", () => {
  it("unions sources and refs for the same id and package", () => {
    const merged = mergeFindings([
      {
        id: "GHSA-fx2h-pf6j-xcff",
        refs: [
          {
            id: "GHSA-fx2h-pf6j-xcff",
            kind: AdvisoryRefKinds.Ghsa,
            url: "https://github.com/advisories/GHSA-fx2h-pf6j-xcff",
          },
        ],
        packageName: "vite",
        version: "7.3.2",
        severity: FindingSeverities.Moderate,
        sources: [SecuritySources.NpmAudit],
        title: "audit",
      },
      {
        id: "GHSA-fx2h-pf6j-xcff",
        refs: [
          {
            id: "CVE-2026-53571",
            kind: AdvisoryRefKinds.Cve,
            url: "https://nvd.nist.gov/vuln/detail/CVE-2026-53571",
          },
        ],
        packageName: "vite",
        severity: FindingSeverities.High,
        sources: [SecuritySources.CveLite],
        title: "vite: server.fs.deny bypass",
      },
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0]?.sources, [
      SecuritySources.NpmAudit,
      SecuritySources.CveLite,
    ]);
    assert.equal(merged[0]?.severity, FindingSeverities.High);
    assert.equal(merged[0]?.version, "7.3.2");
    assert.equal(merged[0]?.title, "vite: server.fs.deny bypass");
    assert.deepEqual(
      merged[0]?.refs.map((ref) => ref.id),
      ["GHSA-fx2h-pf6j-xcff", "CVE-2026-53571"]
    );
  });
});
