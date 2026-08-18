import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rePinPackageJson } from "./repin.js";

describe("rePinPackageJson", () => {
  it("pins rewritten ranges to locked versions", () => {
    const locked = new Map([
      ["leftpad", "1.3.0"],
      ["typescript", "5.9.3"],
    ]);
    const next = rePinPackageJson(
      {
        dependencies: { leftpad: "^1.1.1", local: "workspace:*" },
        devDependencies: { typescript: "^5.0.0" },
      },
      locked
    );
    assert.equal(next.dependencies?.leftpad, "1.3.0");
    assert.equal(next.dependencies?.local, "workspace:*");
    assert.equal(next.devDependencies?.typescript, "5.9.3");
  });
});
