import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadConfig } from "./load.js";
import { writeJsonFile } from "../fsutil.js";

describe("loadConfig", () => {
  it("lets pnpm-workspace.yaml win over package.json and honors --mode", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-cfg-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        beefup: { mode: "same-major", bannedRanges: ["latest"] },
      });
      await writeFile(
        path.join(dir, "pnpm-workspace.yaml"),
        "packages: []\nbeefup:\n  mode: latest\n  bannedRanges:\n    - latest\n    - '*'\n"
      );
      const config = await loadConfig(dir, "same-major");
      assert.equal(config.mode, "same-major");
      assert.deepEqual(config.bannedRanges, ["latest", "*"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
