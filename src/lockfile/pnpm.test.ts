import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { lockedVersionsFromPnpm, parsePnpmLockfile, resolvePnpmLockfile } from "./pnpm.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../__tests__/fixtures"
);

describe("pnpm lockfile resolver", () => {
  it("extracts packages from a simple lockfile", async () => {
    const result = await resolvePnpmLockfile(path.join(fixtures, "pnpm-new.yaml"));
    assert.ok(result.dependencies.some((pkg) => pkg.name === "express" && pkg.version === "4.18.0"));
    assert.ok(result.devDependencies.some((pkg) => pkg.name === "lodash" && pkg.version === "4.17.21"));
  });

  it("reads locked versions from importers", async () => {
    const lock = parsePnpmLockfile(
      await readFile(path.join(fixtures, "pnpm-importers.yaml"), "utf8")
    );
    const locked = lockedVersionsFromPnpm(lock, ".");
    assert.equal(locked.get("express"), "4.18.2");
    assert.equal(locked.get("typescript"), "5.9.3");
  });
});
