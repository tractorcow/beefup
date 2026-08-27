import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFindings,
  FindingSeverities,
  SecuritySources,
} from "./classify.js";

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
});
