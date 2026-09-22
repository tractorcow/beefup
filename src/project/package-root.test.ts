import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BeefupConfigFileName,
  CliOptionFlags,
  DefaultPackageRoot,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { writeJsonFile } from "../fsutil.js";
import { LockfileNames } from "./types.js";
import {
  expandPackageRootPatterns,
  gitPathFromPackageRelative,
  packageRelativeFromGitPath,
  resolveCommandPackageRoots,
  resolvePackageRoot,
} from "./package-root.js";

/**
 * Writes a nested package.json and pnpm lockfile under `dir`.
 */
async function seedLockfilePackage(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonFile(path.join(dir, "package.json"), {
    name,
    version: "1.0.0",
  });
  await writeFile(
    path.join(dir, LockfileNames.Pnpm),
    "lockfileVersion: '9.0'\n"
  );
}

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

describe("expandPackageRootPatterns", () => {
  it("expands globs to directories that have a lockfile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-glob-"));
    try {
      await seedLockfilePackage(path.join(dir, "apps", "web"), "web");
      await seedLockfilePackage(path.join(dir, "apps", "api"), "api");
      await mkdir(path.join(dir, "apps", "docs"), { recursive: true });
      await writeJsonFile(path.join(dir, "apps", "docs", "package.json"), {
        name: "docs",
      });
      const roots = await expandPackageRootPatterns(dir, ["apps/*"]);
      assert.deepEqual(
        roots.map((root) => root.relative).sort(),
        ["apps/api", "apps/web"]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors when a literal package root has no lockfile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-glob-miss-"));
    try {
      await mkdir(path.join(dir, "app"), { recursive: true });
      await writeJsonFile(path.join(dir, "app", "package.json"), { name: "app" });
      await assert.rejects(
        () => expandPackageRootPatterns(dir, ["app"]),
        BeefupError
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveCommandPackageRoots", () => {
  it("uses .beefup.json packageRoot when CLI omits the flag", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-roots-json-"));
    try {
      await seedLockfilePackage(path.join(dir, "apps", "web"), "web");
      await seedLockfilePackage(path.join(dir, "apps", "api"), "api");
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        packageRoot: ["apps/web", "apps/api"],
      });
      const resolved = await resolveCommandPackageRoots({ startDir: dir });
      assert.equal(resolved.projectRoot, path.resolve(dir));
      assert.deepEqual(
        resolved.packageRoots.map((root) => root.relative),
        ["apps/web", "apps/api"]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses package.json#beefup packageRoot when .beefup.json is absent", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-roots-pkg-"));
    try {
      await seedLockfilePackage(path.join(dir, "app"), "app");
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "root",
        beefup: { packageRoot: "app" },
      });
      const resolved = await resolveCommandPackageRoots({ startDir: dir });
      assert.deepEqual(
        resolved.packageRoots.map((root) => root.relative),
        ["app"]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lets CLI --package-root override config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-roots-cli-"));
    try {
      await seedLockfilePackage(path.join(dir, "apps", "web"), "web");
      await seedLockfilePackage(path.join(dir, "apps", "api"), "api");
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        packageRoot: ["apps/web", "apps/api"],
      });
      const resolved = await resolveCommandPackageRoots({
        startDir: dir,
        cliPackageRoots: ["apps/web"],
      });
      assert.deepEqual(
        resolved.packageRoots.map((root) => root.relative),
        ["apps/web"]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("selects only the current package when startDir is one configured root", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-roots-cwd-"));
    try {
      await seedLockfilePackage(path.join(dir, "apps", "web"), "web");
      await seedLockfilePackage(path.join(dir, "apps", "api"), "api");
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        packageRoot: ["apps/*"],
      });
      const resolved = await resolveCommandPackageRoots({
        startDir: path.join(dir, "apps", "web"),
        gitRoot: dir,
      });
      assert.equal(resolved.projectRoot, path.resolve(dir));
      assert.deepEqual(
        resolved.packageRoots.map((root) => root.relative),
        ["apps/web"]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs every configured root from the repo root even when '.' is listed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-roots-dot-"));
    try {
      await seedLockfilePackage(dir, "root");
      await seedLockfilePackage(path.join(dir, "shared"), "shared");
      await seedLockfilePackage(path.join(dir, "lambdas", "api"), "api");
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        packageRoot: [DefaultPackageRoot, "shared", "lambdas/*"],
      });
      const resolved = await resolveCommandPackageRoots({ startDir: dir });
      assert.deepEqual(
        resolved.packageRoots.map((root) => root.relative),
        [DefaultPackageRoot, "shared", "lambdas/api"]
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
