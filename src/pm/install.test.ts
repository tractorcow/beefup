import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BeefupError } from "../errors.js";
import { PackageManagers } from "../project/types.js";
import { frozenInstallArgs, FrozenInstallArgv, installFromLockfile } from "./install.js";
import type { ProcessRunner } from "./runner.js";

describe("frozenInstallArgs", () => {
  it("uses npm ci and pnpm frozen lockfile, never a bare install or ignore-scripts", () => {
    assert.deepEqual(
      frozenInstallArgs(PackageManagers.Npm),
      [...FrozenInstallArgv[PackageManagers.Npm]]
    );
    assert.deepEqual(
      frozenInstallArgs(PackageManagers.Pnpm),
      [...FrozenInstallArgv[PackageManagers.Pnpm]]
    );
    assert.equal(
      frozenInstallArgs(PackageManagers.Npm).includes("install"),
      false
    );
    assert.equal(
      frozenInstallArgs(PackageManagers.Npm).includes("--ignore-scripts"),
      false
    );
    assert.equal(
      frozenInstallArgs(PackageManagers.Pnpm).includes("--ignore-scripts"),
      false
    );
  });
});

describe("installFromLockfile", () => {
  it("runs the frozen install argv through the protected package manager", async () => {
    const calls: { bin: string; args: string[]; cwd: string }[] = [];
    const runner: ProcessRunner = {
      async run(bin, args, cwd) {
        calls.push({ bin, args, cwd });
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await installFromLockfile({
      pm: { bin: "aikido-pnpm", prefixArgs: [] },
      packageManager: PackageManagers.Pnpm,
      cwd: "/tmp/project",
      runner,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      bin: "aikido-pnpm",
      args: frozenInstallArgs(PackageManagers.Pnpm),
      cwd: "/tmp/project",
    });
  });

  it("throws when the installer exits non-zero", async () => {
    const runner: ProcessRunner = {
      async run() {
        return { stdout: "", stderr: "boom", code: 1 };
      },
    };
    await assert.rejects(
      () =>
        installFromLockfile({
          pm: { bin: "aikido-npm", prefixArgs: [] },
          packageManager: PackageManagers.Npm,
          cwd: "/tmp/project",
          runner,
        }),
      BeefupError
    );
  });
});
