import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeJsonFile } from "../fsutil.js";
import { listWorkspacePackages } from "./workspace.js";

describe("listWorkspacePackages", () => {
  it("expands apps/* and packages/* globs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-ws-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "root",
        workspaces: ["apps/*", "packages/*"],
      });
      await writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
      await mkdir(path.join(dir, "apps", "web"), { recursive: true });
      await mkdir(path.join(dir, "packages", "lib"), { recursive: true });
      await writeJsonFile(path.join(dir, "apps", "web", "package.json"), { name: "web" });
      await writeJsonFile(path.join(dir, "packages", "lib", "package.json"), { name: "lib" });
      const listed = await listWorkspacePackages(dir);
      const dirs = listed.map((item) => item.relativeDir).sort();
      assert.deepEqual(dirs, [".", "apps/web", "packages/lib"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
