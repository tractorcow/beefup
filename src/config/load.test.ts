import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeJsonFile } from "../fsutil.js";
import { loadConfig, loadConfigFromDir } from "./load.js";
import {
  BannedRangeTags,
  BeefupConfigFileName,
  UpgradeModes,
} from "./types.js";

describe("loadConfig", () => {
  it("lets pnpm-workspace.yaml win over package.json and honors --mode", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-cfg-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        beefup: {
          mode: UpgradeModes.SameMajor,
          bannedRanges: [BannedRangeTags.Latest],
        },
      });
      await writeFile(
        path.join(dir, "pnpm-workspace.yaml"),
        `packages: []\nbeefup:\n  mode: ${UpgradeModes.Latest}\n  bannedRanges:\n    - ${BannedRangeTags.Latest}\n    - '${BannedRangeTags.Any}'\n`
      );
      const config = await loadConfig(dir, dir, UpgradeModes.SameMajor);
      assert.equal(config.mode, UpgradeModes.SameMajor);
      assert.deepEqual(config.bannedRanges, [
        BannedRangeTags.Latest,
        BannedRangeTags.Any,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges .beefup.json with package.json#beefup including packageRoot", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-cfg-json-"));
    try {
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        mode: UpgradeModes.SameMajor,
        packageRoot: ["apps/*"],
        preferExact: false,
      });
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        beefup: {
          mode: UpgradeModes.Latest,
          packageRoot: "apps/web",
        },
      });
      const config = await loadConfig(dir);
      assert.equal(config.mode, UpgradeModes.Latest);
      assert.equal(config.packageRoot, "apps/web");
      assert.equal(config.preferExact, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads .beefup.json when there is no root package.json", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-cfg-noroom-"));
    try {
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        mode: UpgradeModes.Latest,
        packageRoot: ["apps/web", "apps/api"],
      });
      const partial = await loadConfigFromDir(dir);
      assert.equal(partial.mode, UpgradeModes.Latest);
      assert.deepEqual(partial.packageRoot, ["apps/web", "apps/api"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lets a nested package override repo-level mode", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-cfg-nested-"));
    const app = path.join(dir, "app");
    try {
      await writeJsonFile(path.join(dir, BeefupConfigFileName), {
        mode: UpgradeModes.SameMajor,
      });
      await writeJsonFile(path.join(app, "package.json"), {
        name: "app",
        beefup: { mode: UpgradeModes.Latest },
      });
      const config = await loadConfig(dir, app);
      assert.equal(config.mode, UpgradeModes.Latest);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
