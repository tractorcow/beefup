import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { withSafeChainStubs } from "../__tests__/with-safe-chain-stubs.js";
import { runRewind } from "../commands/rewind.js";
import { ReportComparisons, ReportFormats } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile, writeJsonFile } from "../fsutil.js";
import type { ProcessRunner } from "../pm/runner.js";
import type { PackageJson } from "../project/package-json.js";
import { priorDir, stagedDir } from "../project/paths.js";

const execFile = promisify(execFileCallback);

const runner: ProcessRunner = {
  async run(_bin, args) {
    if (args.includes("audit")) {
      return { stdout: '{"vulnerabilities":{}}', stderr: "", code: 0 };
    }
    return { stdout: "[]", stderr: "", code: 0 };
  },
};

/**
 * Runs a git command in the given working directory.
 */
async function git(args: string[], cwd: string): Promise<void> {
  await execFile("git", args, { cwd });
}

/**
 * Creates a committed git repo with a nested workspace at leftpad 1.0.0.
 */
async function initHistoricRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-rewind-"));
  await git(["init"], dir);
  await git(["config", "user.email", "beefup@example.test"], dir);
  await git(["config", "user.name", "Beefup"], dir);
  await writeJsonFile(path.join(dir, "package.json"), {
    name: "root",
    version: "1.0.0",
    private: true,
    workspaces: ["apps/*"],
    dependencies: { leftpad: "1.0.0" },
  });
  await mkdir(path.join(dir, "apps", "web"), { recursive: true });
  await writeJsonFile(path.join(dir, "apps", "web", "package.json"), {
    name: "web",
    version: "1.0.0",
    dependencies: { leftpad: "1.0.0" },
  });
  await writeFile(
    path.join(dir, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 1.0.0
        version: 1.0.0
  apps/web:
    dependencies:
      leftpad:
        specifier: 1.0.0
        version: 1.0.0
packages:
  leftpad@1.0.0:
    version: 1.0.0
`
  );
  await git(["add", "."], dir);
  await git(["commit", "-m", "historic"], dir);
  return dir;
}

describe("runRewind", () => {
  it("extracts nested package.json files from a git ref and reports applied", async () => {
    await withSafeChainStubs(async () => {
      const dir = await initHistoricRepo();
      try {
        await writeJsonFile(path.join(dir, "package.json"), {
          name: "root",
          version: "1.0.0",
          private: true,
          workspaces: ["apps/*"],
          dependencies: { leftpad: "1.3.0" },
        });
        await writeJsonFile(path.join(dir, "apps", "web", "package.json"), {
          name: "web",
          version: "1.0.0",
          dependencies: { leftpad: "1.3.0" },
        });
        await writeFile(
          path.join(dir, "pnpm-lock.yaml"),
          `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 1.3.0
        version: 1.3.0
  apps/web:
    dependencies:
      leftpad:
        specifier: 1.3.0
        version: 1.3.0
packages:
  leftpad@1.3.0:
    version: 1.3.0
`
        );
        await writeJsonFile(path.join(stagedDir(dir), "package.json"), {
          name: "root",
          version: "1.0.0",
          dependencies: { leftpad: "9.9.9" },
        });
        await writeFile(
          path.join(stagedDir(dir), "pnpm-lock.yaml"),
          `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 9.9.9
        version: 9.9.9
packages:
  leftpad@9.9.9:
    version: 9.9.9
`
        );

        const report = await runRewind({
          projectRoot: dir,
          gitRef: "HEAD",
          format: ReportFormats.Text,
          runner,
        });
        assert.equal(report.comparison, ReportComparisons.Applied);
        const priorRoot = await readJsonFile<PackageJson>(
          path.join(priorDir(dir), "package.json")
        );
        assert.equal(priorRoot.dependencies?.leftpad, "1.0.0");
        const priorWeb = await readJsonFile<PackageJson>(
          path.join(priorDir(dir), "apps", "web", "package.json")
        );
        assert.equal(priorWeb.dependencies?.leftpad, "1.0.0");
        assert.equal(await pathExists(path.join(stagedDir(dir), "package.json")), false);
        const upgraded = report.diff.dependencies.filter(
          (change) => change.name === "leftpad"
        );
        assert.equal(upgraded.length, 1);
        assert.deepEqual(
          upgraded[0]?.from.map((item) => item.version),
          ["1.0.0"]
        );
        assert.deepEqual(
          upgraded[0]?.to.map((item) => item.version),
          ["1.3.0"]
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("fails outside a git repository", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-rewind-nogit-"));
    await writeJsonFile(path.join(dir, "package.json"), {
      name: "demo",
      version: "1.0.0",
    });
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    try {
      await assert.rejects(
        () =>
          runRewind({
            projectRoot: dir,
            gitRef: "HEAD",
            format: ReportFormats.Text,
            runner,
          }),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /git repository/);
          return true;
        }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails on a bad git ref", async () => {
    const dir = await initHistoricRepo();
    try {
      await assert.rejects(
        () =>
          runRewind({
            projectRoot: dir,
            gitRef: "no-such-ref",
            format: ReportFormats.Text,
            runner,
          }),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /invalid git ref/);
          return true;
        }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

});
