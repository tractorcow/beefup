import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BeefupError } from "../errors.js";
import { aikidoBinName, resolveProtectedPm } from "./safe-chain.js";
import { lockfileUpdateArgs } from "./update.js";

describe("safe-chain helpers", () => {
  it("uses aikido binaries, not raw npm/pnpm", () => {
    assert.equal(aikidoBinName("npm"), "aikido-npm");
    assert.equal(aikidoBinName("pnpm"), "aikido-pnpm");
  });

  it("fails when the aikido binary is not on PATH", async () => {
    const previous = process.env.PATH;
    process.env.PATH = "/tmp/beefup-empty-path";
    try {
      await assert.rejects(() => resolveProtectedPm("pnpm"), (error: unknown) => {
        assert.ok(error instanceof BeefupError);
        assert.match(error.message, /Safe-chain is not enabled/);
        return true;
      });
    } finally {
      process.env.PATH = previous;
    }
  });
});

describe("lockfileUpdateArgs", () => {
  it("never installs packages or runs scripts", () => {
    assert.deepEqual(lockfileUpdateArgs("npm"), [
      "update",
      "--package-lock-only",
      "--ignore-scripts",
    ]);
    assert.deepEqual(lockfileUpdateArgs("pnpm"), [
      "update",
      "--lockfile-only",
      "--ignore-scripts",
      "--no-save",
    ]);
  });
});
