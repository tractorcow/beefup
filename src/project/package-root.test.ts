import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { CliOptionFlags, DefaultPackageRoot } from "../config/types.js";
import { BeefupError } from "../errors.js";
import {
  gitPathFromPackageRelative,
  packageRelativeFromGitPath,
  resolvePackageRoot,
} from "./package-root.js";

describe("resolvePackageRoot", () => {
  it("defaults to the project root", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-pkgroot-"));
    try {
      const resolved = resolvePackageRoot(dir);
      assert.equal(resolved.absolute, path.resolve(dir));
      assert.equal(resolved.relative, DefaultPackageRoot);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves a nested package directory inside the project", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-pkgroot-"));
    try {
      const resolved = resolvePackageRoot(dir, "./app");
      assert.equal(resolved.absolute, path.resolve(dir, "app"));
      assert.equal(resolved.relative, "app");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a package root outside the project directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-pkgroot-"));
    try {
      assert.throws(
        () => resolvePackageRoot(dir, ".."),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, new RegExp(CliOptionFlags.PackageRoot));
          return true;
        }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("git package paths", () => {
  it("prefixes git paths with the package root and strips them back", () => {
    assert.equal(
      gitPathFromPackageRelative("app", "package.json"),
      "app/package.json"
    );
    assert.equal(
      gitPathFromPackageRelative(DefaultPackageRoot, "package.json"),
      "package.json"
    );
    assert.equal(
      packageRelativeFromGitPath("app", "app/apps/web/package.json"),
      "apps/web/package.json"
    );
    assert.equal(packageRelativeFromGitPath("app", "other/package.json"), undefined);
    assert.equal(
      packageRelativeFromGitPath(DefaultPackageRoot, "apps/web/package.json"),
      "apps/web/package.json"
    );
  });
});
