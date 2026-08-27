import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeJsonFile } from "../fsutil.js";
import { loadConfig } from "./load.js";
import {
  BannedRangeTags,
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
      const config = await loadConfig(dir, UpgradeModes.SameMajor);
      assert.equal(config.mode, UpgradeModes.SameMajor);
      assert.deepEqual(config.bannedRanges, [
        BannedRangeTags.Latest,
        BannedRangeTags.Any,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
