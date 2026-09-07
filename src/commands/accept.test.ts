import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { withSafeChainStubs } from "../__tests__/with-safe-chain-stubs.js";
import { runAccept } from "../commands/accept.js";
import { BannedRangeTags, StageStrategies } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, readJsonFile, writeJsonFile } from "../fsutil.js";
import { frozenInstallArgs } from "../pm/install.js";
import type { ProcessRunner } from "../pm/runner.js";
import type { PackageJson } from "../project/package-json.js";
import { inProgressPath, stagedDir } from "../project/paths.js";
import { PackageManagers } from "../project/types.js";

const runner: ProcessRunner = {
  async run() {
    return { stdout: "", stderr: "", code: 0 };
  },
};

/**
 * Seeds a temp project with live + staged pnpm manifests and lockfiles.
 */
async function seedStagedProject(dir: string): Promise<void> {
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

  const staged = stagedDir(dir);
  await writeJsonFile(path.join(staged, "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.3.0" },
  });
  await writeFile(
    path.join(staged, "pnpm-lock.yaml"),
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

describe("runAccept", () => {
  it("copies staged files into the live tree and installs from the frozen lockfile", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-"));
      await seedStagedProject(dir);
      const calls: { args: string[]; cwd: string }[] = [];
      const recordingRunner: ProcessRunner = {
        async run(_bin, args, cwd) {
          calls.push({ args, cwd });
          return { stdout: "", stderr: "", code: 0 };
        },
      };
      try {
        const result = await runAccept({
          projectRoot: dir,
          runner: recordingRunner,
        });
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        assert.equal(live.dependencies?.leftpad, "1.3.0");
        const liveLock = await readFile(path.join(dir, "pnpm-lock.yaml"), "utf8");
        assert.match(liveLock, /1\.3\.0/);
        assert.equal(result.packageManager, PackageManagers.Pnpm);
        assert.ok(result.copied.includes("package.json"));
        assert.ok(result.copied.includes("pnpm-lock.yaml"));
        assert.equal(calls.length, 1);
        const expected = frozenInstallArgs(PackageManagers.Pnpm);
        assert.ok(expected.every((arg) => calls[0]?.args.includes(arg)));
        assert.equal(calls[0]?.args.includes("update"), false);
        assert.equal(calls[0]?.cwd, path.resolve(dir));
        assert.equal(await pathExists(path.join(stagedDir(dir), "package.json")), true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("copies workspace package.json files from staged", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-ws-"));
      await seedStagedProject(dir);
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "root",
        version: "1.0.0",
        private: true,
        workspaces: ["apps/*"],
      });
      await mkdir(path.join(dir, "apps", "web"), { recursive: true });
      await writeJsonFile(path.join(dir, "apps", "web", "package.json"), {
        name: "web",
        version: "1.0.0",
        dependencies: { leftpad: "1.0.0" },
      });
      await writeJsonFile(path.join(stagedDir(dir), "package.json"), {
        name: "root",
        version: "1.0.0",
        private: true,
        workspaces: ["apps/*"],
      });
      await mkdir(path.join(stagedDir(dir), "apps", "web"), { recursive: true });
      await writeJsonFile(path.join(stagedDir(dir), "apps", "web", "package.json"), {
        name: "web",
        version: "1.0.0",
        dependencies: { leftpad: "1.3.0" },
      });
      try {
        const result = await runAccept({ projectRoot: dir, runner });
        const web = await readJsonFile<PackageJson>(
          path.join(dir, "apps", "web", "package.json")
        );
        assert.equal(web.dependencies?.leftpad, "1.3.0");
        assert.ok(result.copied.includes("apps/web/package.json"));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("fails when no staged lockfile exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-missing-"));
    await writeJsonFile(path.join(dir, "package.json"), {
      name: "demo",
      version: "1.0.0",
    });
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    try {
      await assert.rejects(
        () => runAccept({ projectRoot: dir, runner }),
        BeefupError
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to accept while an in-place stage is in progress", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-ip-"));
    await seedStagedProject(dir);
    await writeFile(inProgressPath(dir), `${StageStrategies.Inplace}\n`);
    try {
      await assert.rejects(
        () => runAccept({ projectRoot: dir, runner }),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /in-place stage is in progress/);
          return true;
        }
      );
      const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
      assert.equal(live.dependencies?.leftpad, "1.0.0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not copy files when staged policy fails", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-policy-"));
      await seedStagedProject(dir);
      await writeJsonFile(path.join(stagedDir(dir), "package.json"), {
        name: "demo",
        version: "1.0.0",
        dependencies: { leftpad: BannedRangeTags.Latest },
      });
      try {
        await assert.rejects(
          () => runAccept({ projectRoot: dir, runner }),
          (error: unknown) => {
            assert.ok(error instanceof BeefupError);
            assert.match(error.message, /policy failed/);
            return true;
          }
        );
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        assert.equal(live.dependencies?.leftpad, "1.0.0");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("keeps applied files when frozen install fails", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-accept-install-"));
      await seedStagedProject(dir);
      const failingRunner: ProcessRunner = {
        async run() {
          return { stdout: "", stderr: "network down", code: 1 };
        },
      };
      try {
        await assert.rejects(
          () => runAccept({ projectRoot: dir, runner: failingRunner }),
          BeefupError
        );
        const live = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
        assert.equal(live.dependencies?.leftpad, "1.3.0");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
