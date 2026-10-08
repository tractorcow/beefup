import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UpgradeModes } from "../config/types.js";
import {
  rePinOverrideMap,
  rePinPackageJsonOverrides,
  rewriteOverrideMap,
  rewritePackageJsonOverrides,
} from "./overrides.js";

describe("rewriteOverrideMap", () => {
  it("rewrites exact override pins to caret for same-major", () => {
    const next = rewriteOverrideMap(
      {
        axios: "1.18.1",
        "update-browserslist-db": { picocolors: "1.0.1" },
        "es5-ext": { ".": "0.10.63" },
      },
      UpgradeModes.SameMajor
    );
    assert.equal(next.axios, "^1.18.1");
    assert.deepEqual(next["update-browserslist-db"], {
      picocolors: "^1.0.1",
    });
    assert.deepEqual(next["es5-ext"], { ".": "^0.10.63" });
  });

  it("rewrites override pins to gte for latest", () => {
    assert.equal(
      rewriteOverrideMap({ axios: "1.18.1" }, UpgradeModes.Latest).axios,
      ">=1.18.1"
    );
  });

  it("leaves $refs and protocol specs unchanged", () => {
    const next = rewriteOverrideMap(
      {
        axios: "$axios",
        local: "file:../lib",
      },
      UpgradeModes.SameMajor
    );
    assert.equal(next.axios, "$axios");
    assert.equal(next.local, "file:../lib");
  });
});

describe("rePinOverrideMap", () => {
  it("pins override targets to locked versions", () => {
    const locked = new Map([
      ["axios", "1.19.0"],
      ["picocolors", "1.0.2"],
      ["es5-ext", "0.10.64"],
    ]);
    const next = rePinOverrideMap(
      {
        axios: "^1.18.1",
        "update-browserslist-db": { picocolors: "^1.0.1" },
        "es5-ext": { ".": "^0.10.63" },
      },
      locked
    );
    assert.equal(next.axios, "1.19.0");
    assert.deepEqual(next["update-browserslist-db"], {
      picocolors: "1.0.2",
    });
    assert.deepEqual(next["es5-ext"], { ".": "0.10.64" });
  });

  it("leaves $refs unchanged when re-pinning", () => {
    const next = rePinOverrideMap(
      { axios: "$axios" },
      new Map([["axios", "1.19.0"]])
    );
    assert.equal(next.axios, "$axios");
  });
});

describe("package.json override helpers", () => {
  it("rewrites and re-pins package.json overrides", () => {
    const rewritten = rewritePackageJsonOverrides(
      {
        dependencies: { leftpad: "1.0.0" },
        overrides: { axios: "1.18.1" },
      },
      UpgradeModes.SameMajor
    );
    assert.equal(rewritten.overrides?.axios, "^1.18.1");
    assert.equal(rewritten.dependencies?.leftpad, "1.0.0");

    const pinned = rePinPackageJsonOverrides(
      rewritten,
      new Map([["axios", "1.19.0"]])
    );
    assert.equal(pinned.overrides?.axios, "1.19.0");
  });
});
