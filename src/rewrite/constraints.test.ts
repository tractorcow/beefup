import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rewriteConstraint, rewritePackageJson, shouldSkipSpec } from "./constraints.js";

describe("rewriteConstraint", () => {
  it("rewrites exact pins to caret for same-major", () => {
    assert.equal(rewriteConstraint("1.2.3", "same-major"), "^1.2.3");
  });

  it("rewrites exact pins to gte for latest", () => {
    assert.equal(rewriteConstraint("1.2.3", "latest"), ">=1.2.3");
  });

  it("uses the range minimum when the spec is already a range", () => {
    assert.equal(rewriteConstraint("^2.3.3", "same-major"), "^2.3.3");
    assert.equal(rewriteConstraint("^2.3.3", "latest"), ">=2.3.3");
  });

  it("skips workspace and file specs", () => {
    assert.equal(shouldSkipSpec("workspace:*"), true);
    assert.equal(shouldSkipSpec("file:../lib"), true);
    assert.equal(rewriteConstraint("workspace:*", "same-major"), null);
  });
});

describe("rewritePackageJson", () => {
  it("rewrites direct dependency buckets only", () => {
    const next = rewritePackageJson(
      {
        dependencies: { leftpad: "1.1.1", local: "workspace:*" },
        devDependencies: { typescript: "5.0.0" },
        peerDependencies: { react: "18.2.0" },
      },
      "same-major"
    );
    assert.equal(next.dependencies?.leftpad, "^1.1.1");
    assert.equal(next.dependencies?.local, "workspace:*");
    assert.equal(next.devDependencies?.typescript, "^5.0.0");
    assert.equal(next.peerDependencies?.react, "18.2.0");
  });
});
