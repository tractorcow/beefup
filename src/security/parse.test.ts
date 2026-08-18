import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNpmAuditJson } from "./npm-audit.js";
import { parseCveLiteJson } from "./cve-lite.js";

describe("parseNpmAuditJson", () => {
  it("flattens npm audit vulnerabilities", () => {
    const findings = parseNpmAuditJson(
      JSON.stringify({
        vulnerabilities: {
          lodash: {
            name: "lodash",
            severity: "high",
            via: [
              {
                source: 123,
                name: "lodash",
                title: "Prototype pollution",
                severity: "high",
              },
            ],
          },
        },
      })
    );
    assert.equal(findings[0]?.id, "123");
    assert.equal(findings[0]?.packageName, "lodash");
    assert.equal(findings[0]?.source, "npm-audit");
  });
});

describe("parseCveLiteJson", () => {
  it("reads findings arrays", () => {
    const findings = parseCveLiteJson(
      JSON.stringify({
        findings: [
          { id: "GHSA-x", package: "express", severity: "medium", version: "4.18.0" },
        ],
      })
    );
    assert.equal(findings[0]?.id, "GHSA-x");
    assert.equal(findings[0]?.severity, "moderate");
    assert.equal(findings[0]?.source, "cve-lite");
  });
});
