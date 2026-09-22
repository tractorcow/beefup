import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BannedRangeTags } from "../config/types.js";
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
      { overrides: { ws: BannedRangeTags.Latest } },
      { packages: {} }
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, new RegExp(BannedRangeTags.Latest));
  });

  it("errors when a workspace-only override pin sits below a requested range", () => {
    const findings = findStaleOverridePins(
      {},
      {
        packages: {
          "node_modules/jwk-to-pem": {
            dependencies: { elliptic: "^6.6.1" },
          },
        },
      },
      { elliptic: "6.5.7" }
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /below/);
  });

  it("errors when a workspace-only override uses latest", () => {
    const findings = findStaleOverridePins({}, { packages: {} }, { ws: BannedRangeTags.Latest });
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, new RegExp(BannedRangeTags.Latest));
  });
});

describe("findWorkspaceOverrideDrift", () => {
  it("errors when package.json and workspace overrides disagree on a shared key", () => {
    const findings = findWorkspaceOverrideDrift(
      { overrides: { foo: "1.0.0" } },
      { foo: "1.0.1" }
    );
    assert.equal(findings.length, 1);
  });

  it("ignores workspace-only override keys", () => {
    const findings = findWorkspaceOverrideDrift({}, { ajv: "8.18.0", foo: "1.0.0" });
    assert.equal(findings.length, 0);
  });

  it("ignores package.json-only override keys", () => {
    const findings = findWorkspaceOverrideDrift(
      { overrides: { foo: "1.0.0" } },
      { bar: "2.0.0" }
    );
    assert.equal(findings.length, 0);
  });

  it("ignores shared keys with the same value", () => {
    const findings = findWorkspaceOverrideDrift(
      { overrides: { foo: "1.0.0" } },
      { foo: "1.0.0" }
    );
    assert.equal(findings.length, 0);
  });
});
