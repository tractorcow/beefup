import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { withSafeChainStubs } from "../__tests__/with-safe-chain-stubs.js";
import { runStage } from "../commands/stage.js";
import { ReportFormats, StageStrategies } from "../config/types.js";
import { pathExists, readJsonFile, writeJsonFile } from "../fsutil.js";
import type { ProcessRunner } from "../pm/runner.js";
import type { PackageJson } from "../project/package-json.js";
import { BEEFUP_DIR, priorDir } from "../project/paths.js";

const execFile = promisify(execFileCallback);

const upgradedLock = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: ^1.0.0
        version: 1.3.0
packages:
  leftpad@1.3.0:
    version: 1.3.0
`;

const runner: ProcessRunner = {
  async run(_bin, args, cwd) {
    if (args.includes("update")) {
      await writeFile(path.join(cwd, "pnpm-lock.yaml"), upgradedLock);
      return { stdout: "", stderr: "", code: 0 };
    }
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
 * Seeds a minimal pnpm project with package.json and lockfile fixtures.
 */
async function seedPnpmProject(dir: string): Promise<void> {
  await writeJsonFile(path.join(dir, "package.json"), {
    name: "demo",
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
packages:
  leftpad@1.0.0:
    version: 1.0.0
`
  );
}

describe("runStage", () => {
  it("worktree writes staged package.json and lockfile without mutating live files", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-wt-"));
      await seedPnpmProject(dir);
      await git(["init"], dir);
      await git(["config", "user.email", "beefup@example.test"], dir);
      await git(["config", "user.name", "Beefup"], dir);
      await git(["add", "."], dir);
      await git(["commit", "-m", "init"], dir);

      try {
        const report = await runStage({
          projectRoot: dir,
          strategy: StageStrategies.Worktree,
          format: ReportFormats.Text,
          runner,
        });
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        const staged = await readJsonFile<PackageJson>(
          path.join(dir, ".beefup", "staged", "package.json")
        );
        assert.equal(live.dependencies?.leftpad, "1.0.0");
        assert.equal(staged.dependencies?.leftpad, "1.3.0");
        const stagedLock = await readFile(
          path.join(dir, ".beefup", "staged", "pnpm-lock.yaml"),
          "utf8"
        );
        assert.match(stagedLock, /1\.3\.0/);
        assert.equal(report.strategy, StageStrategies.Worktree);
        assert.equal(await pathExists(path.join(dir, ".beefup", "prior")), false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("stages a nested package-root into that package's .beefup/staged", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-pkg-"));
      await mkdir(path.join(dir, "app"), { recursive: true });
      await seedPnpmProject(path.join(dir, "app"));
      await git(["init"], dir);
      await git(["config", "user.email", "beefup@example.test"], dir);
      await git(["config", "user.name", "Beefup"], dir);
      await git(["add", "."], dir);
      await git(["commit", "-m", "init"], dir);

      try {
        await runStage({
          projectRoot: dir,
          packageRoot: "app",
          strategy: StageStrategies.Worktree,
          format: ReportFormats.Text,
          runner,
        });
        const live = await readJsonFile<PackageJson>(
          path.join(dir, "app", "package.json")
        );
        const staged = await readJsonFile<PackageJson>(
          path.join(dir, "app", ".beefup", "staged", "package.json")
        );
        assert.equal(live.dependencies?.leftpad, "1.0.0");
        assert.equal(staged.dependencies?.leftpad, "1.3.0");
        assert.equal(
          await pathExists(path.join(dir, ".beefup", "staged", "package.json")),
          false
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("deletes an existing prior snapshot when staging a new proposal", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-prior-"));
      await seedPnpmProject(dir);
      await writeJsonFile(path.join(priorDir(dir), "package.json"), {
        name: "old",
        version: "0.0.0",
      });
      try {
        await runStage({
          projectRoot: dir,
          strategy: StageStrategies.Inplace,
          format: ReportFormats.Text,
          runner,
        });
        assert.equal(await pathExists(path.join(priorDir(dir), "package.json")), false);
        assert.equal(
          await pathExists(path.join(dir, ".beefup", "staged", "package.json")),
          true
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("inplace writes the same staged outputs and restores the live tree", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-ip-"));
      await seedPnpmProject(dir);
      try {
        await runStage({
          projectRoot: dir,
          strategy: StageStrategies.Inplace,
          format: ReportFormats.Html,
          runner,
        });
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        const staged = await readJsonFile<PackageJson>(
          path.join(dir, ".beefup", "staged", "package.json")
        );
        assert.equal(live.dependencies?.leftpad, "1.0.0");
        assert.equal(staged.dependencies?.leftpad, "1.3.0");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("keeps staged snapshots co-located so two package roots do not clobber each other", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-multi-"));
      await mkdir(path.join(dir, "apps", "web"), { recursive: true });
      await mkdir(path.join(dir, "apps", "api"), { recursive: true });
      await seedPnpmProject(path.join(dir, "apps", "web"));
      await seedPnpmProject(path.join(dir, "apps", "api"));
      try {
        await runStage({
          projectRoot: dir,
          packageRoot: "apps/web",
          strategy: StageStrategies.Inplace,
          format: ReportFormats.Text,
          runner,
        });
        await runStage({
          projectRoot: dir,
          packageRoot: "apps/api",
          strategy: StageStrategies.Inplace,
          format: ReportFormats.Text,
          runner,
        });
        assert.equal(
          await pathExists(
            path.join(dir, "apps", "web", BEEFUP_DIR, "staged", "package.json")
          ),
          true
        );
        assert.equal(
          await pathExists(
            path.join(dir, "apps", "api", BEEFUP_DIR, "staged", "package.json")
          ),
          true
        );
        assert.equal(await pathExists(path.join(dir, BEEFUP_DIR)), false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
