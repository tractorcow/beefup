import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findStaleOverridePins, findWorkspaceOverrideDrift } from "./overrides.js";

describe("findStaleOverridePins", () => {
  it("errors when an override pin sits below a requested range", () => {
    const findings = findStaleOverridePins(
      { overrides: { elliptic: "6.5.7" } },
      {
        packages: {
          "node_modules/jwk-to-pem": {
            dependencies: { elliptic: "^6.6.1" },
          },
        },
      }
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /below/);
  });

  it("errors when an override uses latest", () => {
    const findings = findStaleOverridePins(
      { overrides: { ws: "latest" } },
      { packages: {} }
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /latest/);
  });
});

describe("findWorkspaceOverrideDrift", () => {
  it("errors when package.json and workspace overrides disagree", () => {
    const findings = findWorkspaceOverrideDrift(
      { overrides: { foo: "1.0.0" } },
      { foo: "1.0.1" }
    );
    assert.equal(findings.length, 1);
  });
});
