import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyFindings } from "./classify.js";

describe("classifyFindings", () => {
  it("splits fixed, introduced, and retained CVEs by id and package", () => {
    const result = classifyFindings(
      [
        { id: "CVE-1", packageName: "a", severity: "high", source: "npm-audit" },
        { id: "CVE-2", packageName: "b", severity: "low", source: "cve-lite" },
      ],
      [
        { id: "CVE-2", packageName: "b", severity: "low", source: "cve-lite" },
        { id: "CVE-3", packageName: "c", severity: "critical", source: "npm-audit" },
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
    assert.equal(result.introduced[0].severity, "critical");
  });
});
