import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { BeefupError } from "../errors.js";
import { readJsonFile } from "../fsutil.js";
import { BEEFUP_DIR } from "../project/paths.js";
import { WorktreeStrategy } from "./worktree.js";

const execFile = promisify(execFileCallback);

/**
 * Runs a git command in the given working directory.
 */
async function git(args: string[], cwd: string): Promise<void> {
  await execFile("git", args, { cwd });
}

/**
 * Creates a committed git repo with a minimal package.json and lockfile.
 */
async function initRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-wt-"));
  await git(["init"], dir);
  await git(["config", "user.email", "beefup@example.test"], dir);
  await git(["config", "user.name", "Beefup"], dir);
  await writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "demo", version: "1.0.0", dependencies: { leftpad: "1.0.0" } }, null, 2)}\n`
  );
  await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await git(["add", "."], dir);
  await git(["commit", "-m", "init"], dir);
  return dir;
}

describe("WorktreeStrategy", () => {
  it("fails when the working tree is dirty", async () => {
    const dir = await initRepo();
    try {
      await writeFile(path.join(dir, "dirty.txt"), "nope\n");
      const strategy = new WorktreeStrategy(dir);
      await assert.rejects(() => strategy.prepare(), (error: unknown) => {
        assert.ok(error instanceof BeefupError);
        assert.match(error.message, /clean working tree/);
        return true;
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows untracked files under .beefup so a previous stage can be re-run", async () => {
    const dir = await initRepo();
    const strategy = new WorktreeStrategy(dir);
    try {
      await mkdir(path.join(dir, BEEFUP_DIR, "staged"), { recursive: true });
      await writeFile(
        path.join(dir, BEEFUP_DIR, "staged", "package.json"),
        `${JSON.stringify({ name: "demo" }, null, 2)}\n`
      );
      const workspace = await strategy.prepare();
      assert.equal(workspace.root, path.join(dir, BEEFUP_DIR, "work"));
    } finally {
      await strategy.cleanup();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("still fails when a non-.beefup file is dirty alongside .beefup artefacts", async () => {
    const dir = await initRepo();
    try {
      await mkdir(path.join(dir, BEEFUP_DIR, "staged"), { recursive: true });
      await writeFile(
        path.join(dir, BEEFUP_DIR, "staged", "package.json"),
        `${JSON.stringify({ name: "demo" }, null, 2)}\n`
      );
      await writeFile(path.join(dir, "dirty.txt"), "nope\n");
      const strategy = new WorktreeStrategy(dir);
      await assert.rejects(() => strategy.prepare(), /clean working tree/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails outside a git repository", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-nogit-"));
    try {
      const strategy = new WorktreeStrategy(dir);
      await assert.rejects(() => strategy.prepare(), /git repository/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks out HEAD into .beefup/work without touching the live tree", async () => {
    const dir = await initRepo();
    const strategy = new WorktreeStrategy(dir);
    try {
      const workspace = await strategy.prepare();
      assert.equal(workspace.root, path.join(dir, BEEFUP_DIR, "work"));
      const live = await readJsonFile<{ dependencies: { leftpad: string } }>(
        path.join(dir, "package.json")
      );
      const work = await readJsonFile<{ dependencies: { leftpad: string } }>(
        path.join(workspace.root, "package.json")
      );
      assert.equal(live.dependencies.leftpad, "1.0.0");
      assert.equal(work.dependencies.leftpad, "1.0.0");
      await mkdir(path.join(workspace.root, "apps", "web"), { recursive: true });
    } finally {
      await strategy.cleanup();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
