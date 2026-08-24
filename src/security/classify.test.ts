import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFindings,
  FindingSeverities,
  SecuritySources,
} from "./classify.js";

describe("classifyFindings", () => {
  it("splits fixed, introduced, and retained CVEs by id and package", () => {
    const result = classifyFindings(
      [
        {
          id: "CVE-1",
          packageName: "a",
          severity: FindingSeverities.High,
          source: SecuritySources.NpmAudit,
        },
        {
          id: "CVE-2",
          packageName: "b",
          severity: FindingSeverities.Low,
          source: SecuritySources.CveLite,
        },
      ],
      [
        {
          id: "CVE-2",
          packageName: "b",
          severity: FindingSeverities.Low,
          source: SecuritySources.CveLite,
        },
        {
          id: "CVE-3",
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
      result.retained.map((item) => item.id),
      ["CVE-2"]
    );
    assert.equal(result.introduced[0].severity, FindingSeverities.Critical);
  });
});
