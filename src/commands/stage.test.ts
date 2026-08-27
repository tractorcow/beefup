import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { runStage } from "../commands/stage.js";
import { ReportFormats, StageStrategies } from "../config/types.js";
import { readJsonFile, writeJsonFile } from "../fsutil.js";
import type { ProcessRunner } from "../pm/runner.js";
import type { PackageJson } from "../project/package-json.js";

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
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("inplace writes the same staged outputs and restores the live tree", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-stage-ip-"));
    await seedPnpmProject(dir);
    try {
      await runStage({
        projectRoot: dir,
        strategy: StageStrategies.Inplace,
        format: ReportFormats.Json,
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
