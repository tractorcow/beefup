import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PackageManagers } from "../project/types.js";
import type { ProcessRunner } from "./runner.js";
import { regenerateLockfile } from "./update.js";

describe("regenerateLockfile", () => {
  it("streams package-manager output unless streaming is disabled", async () => {
    const streamed: boolean[] = [];
    const runner: ProcessRunner = {
      async run(_bin, _args, _cwd, options) {
        streamed.push(options?.stream === true);
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    const pm = { bin: "npm", prefixArgs: [] };
    await regenerateLockfile({
      pm,
      packageManager: PackageManagers.Npm,
      cwd: "/tmp/project",
      runner,
    });
    await regenerateLockfile({
      pm,
      packageManager: PackageManagers.Npm,
      cwd: "/tmp/project",
      runner,
      stream: false,
    });
    assert.deepEqual(streamed, [true, false]);
  });
});
