import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withIsolatedPathStubs } from "../__tests__/with-safe-chain-stubs.js";
import { CliOptionFlags } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { PackageManagers } from "../project/types.js";
import { aikidoBinName, resolveProtectedPm, SafeChainBins } from "./safe-chain.js";
import { lockfileUpdateArgs } from "./update.js";

describe("safe-chain helpers", () => {
  it("uses aikido binaries, not raw npm/pnpm", () => {
    assert.equal(aikidoBinName(PackageManagers.Npm), SafeChainBins.AikidoNpm);
    assert.equal(aikidoBinName(PackageManagers.Pnpm), SafeChainBins.AikidoPnpm);
  });

  it("fails when the aikido binary is not on PATH", async () => {
    const previous = process.env.PATH;
    process.env.PATH = "/tmp/beefup-empty-path";
    try {
      await assert.rejects(
        () => resolveProtectedPm(PackageManagers.Pnpm),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /Safe-chain is not enabled/);
          assert.match(error.message, new RegExp(CliOptionFlags.NoSafeChain));
          return true;
        }
      );
    } finally {
      process.env.PATH = previous;
    }
  });

  it("does not fall back to raw pnpm when Safe Chain is missing", async () => {
    await withIsolatedPathStubs([PackageManagers.Pnpm], async () => {
      await assert.rejects(() => resolveProtectedPm(PackageManagers.Pnpm), (error: unknown) => {
        assert.ok(error instanceof BeefupError);
        assert.match(error.message, /Safe-chain is not enabled/);
        return true;
      });
    });
  });

  it("uses the raw package manager when noSafeChain is set", async () => {
    await withIsolatedPathStubs([PackageManagers.Pnpm], async () => {
      const pm = await resolveProtectedPm(PackageManagers.Pnpm, { noSafeChain: true });
      assert.match(pm.bin, /pnpm$/);
      assert.deepEqual(pm.prefixArgs, []);
    });
  });

  it("fails noSafeChain when the raw package manager is missing", async () => {
    await withIsolatedPathStubs([], async () => {
      await assert.rejects(
        () => resolveProtectedPm(PackageManagers.Pnpm, { noSafeChain: true }),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, new RegExp(`${PackageManagers.Pnpm} was not found on PATH`));
          return true;
        }
      );
    });
  });
});

describe("lockfileUpdateArgs", () => {
  it("never installs packages or runs scripts", () => {
    assert.deepEqual(lockfileUpdateArgs(PackageManagers.Npm), [
      "update",
      "--package-lock-only",
      "--ignore-scripts",
    ]);
    assert.deepEqual(lockfileUpdateArgs(PackageManagers.Pnpm), [
      "update",
      "--lockfile-only",
      "--ignore-scripts",
      "--no-save",
    ]);
  });
});
