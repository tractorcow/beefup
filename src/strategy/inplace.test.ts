import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeJsonFile } from "../fsutil.js";
import { inProgressPath } from "../project/paths.js";
import { InPlaceStrategy } from "./inplace.js";

async function seedProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-ip-"));
  await writeJsonFile(path.join(dir, "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.0.0" },
  });
  await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return dir;
}

describe("InPlaceStrategy", () => {
  it("restores live files after mutation", async () => {
    const dir = await seedProject();
    const strategy = new InPlaceStrategy(dir, "pnpm-lock.yaml");
    try {
      const workspace = await strategy.prepare();
      assert.equal(workspace.root, dir);
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        version: "1.0.0",
        dependencies: { leftpad: "^1.0.0" },
      });
      await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nupgraded: true\n");
    } finally {
      await strategy.cleanup();
    }
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      dependencies: { leftpad: string };
    };
    assert.equal(pkg.dependencies.leftpad, "1.0.0");
    const lock = await readFile(path.join(dir, "pnpm-lock.yaml"), "utf8");
    assert.equal(lock.includes("upgraded"), false);
    await rm(dir, { recursive: true, force: true });
  });

  it("restores leftover IN_PROGRESS state on the next prepare", async () => {
    const dir = await seedProject();
    const strategy = new InPlaceStrategy(dir, "pnpm-lock.yaml");
    await strategy.prepare();
    await writeJsonFile(path.join(dir, "package.json"), {
      name: "demo",
      dependencies: { leftpad: "9.9.9" },
    });
    const crashed = new InPlaceStrategy(dir, "pnpm-lock.yaml");
    await crashed.prepare();
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      dependencies: { leftpad: string };
    };
    assert.equal(pkg.dependencies.leftpad, "1.0.0");
    await crashed.cleanup();
    assert.equal(
      await readFile(inProgressPath(dir), "utf8").catch(() => "gone"),
      "gone"
    );
    await rm(dir, { recursive: true, force: true });
  });
});
