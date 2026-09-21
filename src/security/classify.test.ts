import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFindings,
  FindingSeverities,
  SecuritySources,
  type SecurityFinding,
} from "./classify.js";
import { META_VULN_TITLE } from "./npm-audit.js";

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
    source: SecuritySources.NpmAudit,
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
    source: SecuritySources.NpmAudit,
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
          source: SecuritySources.NpmAudit,
        },
        {
          id: "CVE-2",
          refs: [],
          packageName: "b",
          severity: FindingSeverities.Low,
          source: SecuritySources.CveLite,
        },
      ],
      [
        {
          id: "CVE-2",
          refs: [],
          packageName: "b",
          severity: FindingSeverities.Low,
          source: SecuritySources.CveLite,
        },
        {
          id: "CVE-3",
          refs: [],
          packageName: "c",
          severity: FindingSeverities.Critical,
          source: SecuritySources.NpmAudit,
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
});
