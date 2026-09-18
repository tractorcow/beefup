import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { withSafeChainStubs } from "../__tests__/with-safe-chain-stubs.js";
import { runRevert } from "../commands/revert.js";
import { StageStrategies } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile, writeJsonFile } from "../fsutil.js";
import { frozenInstallArgs } from "../pm/install.js";
import type { ProcessRunner } from "../pm/runner.js";
import type { PackageJson } from "../project/package-json.js";
import { inProgressPath, priorDir, stagedDir } from "../project/paths.js";
import { PackageManagers } from "../project/types.js";

const runner: ProcessRunner = {
  async run() {
    return { stdout: "", stderr: "", code: 0 };
  },
};

/**
 * Seeds live applied files plus a prior baseline (and leftover staged to clear).
 */
async function seedAppliedProject(dir: string): Promise<void> {
  await writeJsonFile(path.join(dir, "package.json"), {
    name: "demo",
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
packages:
  leftpad@1.3.0:
    version: 1.3.0
`
  );

  await writeJsonFile(path.join(priorDir(dir), "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.0.0" },
  });
  await writeFile(
    path.join(priorDir(dir), "pnpm-lock.yaml"),
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

  await writeJsonFile(path.join(stagedDir(dir), "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.3.0" },
  });
  await writeFile(
    path.join(stagedDir(dir), "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 1.3.0
        version: 1.3.0
packages:
  leftpad@1.3.0:
    version: 1.3.0
`
  );
}

describe("runRevert", () => {
  it("restores prior files and installs from the frozen lockfile", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-revert-"));
      await seedAppliedProject(dir);
      const calls: { args: string[]; cwd: string }[] = [];
      const recordingRunner: ProcessRunner = {
        async run(_bin, args, cwd) {
          calls.push({ args, cwd });
          return { stdout: "", stderr: "", code: 0 };
        },
      };
      try {
        const result = await runRevert({
          projectRoot: dir,
          runner: recordingRunner,
        });
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        assert.equal(live.dependencies?.leftpad, "1.0.0");
        const liveLock = await readFile(path.join(dir, "pnpm-lock.yaml"), "utf8");
        assert.match(liveLock, /1\.0\.0/);
        assert.equal(result.packageManager, PackageManagers.Pnpm);
        assert.ok(result.copied.includes("package.json"));
        assert.ok(result.copied.includes("pnpm-lock.yaml"));
        const expected = frozenInstallArgs(PackageManagers.Pnpm);
        const installCalls = calls.filter((call) =>
          expected.every((arg) => call.args.includes(arg))
        );
        assert.equal(installCalls.length, 1);
        assert.ok(expected.every((arg) => installCalls[0]?.args.includes(arg)));
        assert.equal(installCalls[0]?.cwd, path.resolve(dir));
        assert.equal(await pathExists(path.join(stagedDir(dir), "package.json")), false);
        assert.equal(await pathExists(path.join(priorDir(dir), "package.json")), true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("fails when no prior lockfile exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-revert-missing-"));
    await writeJsonFile(path.join(dir, "package.json"), {
      name: "demo",
      version: "1.0.0",
    });
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    try {
      await assert.rejects(
        () => runRevert({ projectRoot: dir, runner }),
        BeefupError
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to revert while an in-place stage is in progress", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-revert-ip-"));
    await seedAppliedProject(dir);
    await writeFile(inProgressPath(dir), `${StageStrategies.Inplace}\n`);
    try {
      await assert.rejects(
        () => runRevert({ projectRoot: dir, runner }),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /in-place stage is in progress/);
          return true;
        }
      );
      const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
      assert.equal(live.dependencies?.leftpad, "1.3.0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
