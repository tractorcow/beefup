import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeJsonFile } from "../fsutil.js";
import { detectProject } from "./detect.js";

describe("detectProject", () => {
  it("detects pnpm from the lockfile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-det-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), { name: "demo" });
      await writeJsonFile(path.join(dir, "pnpm-lock.yaml"), { lockfileVersion: "9.0" });
      const detected = await detectProject(dir);
      assert.equal(detected.packageManager, "pnpm");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses packageManager when both lockfiles exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-det-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        packageManager: "npm@12.0.0",
      });
      await writeJsonFile(path.join(dir, "package-lock.json"), { lockfileVersion: 3 });
      await writeJsonFile(path.join(dir, "pnpm-lock.yaml"), { lockfileVersion: "9.0" });
      const detected = await detectProject(dir);
      assert.equal(detected.packageManager, "npm");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
