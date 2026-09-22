import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { BeefupError } from "../errors.js";
import { BEEFUP_DIR } from "../project/paths.js";
import {
  GitRefs,
  gitShowFile,
  hasNonBeefupWorkingTreeChanges,
} from "./git.js";

const execFile = promisify(execFileCallback);

/** One byte over Node execFile's default 1MiB maxBuffer. */
const LargerThanExecMaxBuffer = `${"x".repeat(1024 * 1024 + 1)}\n`;

/**
 * Runs a git command in the given working directory.
 */
async function git(args: string[], cwd: string): Promise<void> {
  await execFile("git", args, { cwd });
}

/**
 * Creates a committed git repo containing a nested lockfile larger than 1MiB.
 */
async function initRepoWithLargeLockfile(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-git-show-"));
  await git(["init"], dir);
  await git(["config", "user.email", "beefup@example.test"], dir);
  await git(["config", "user.name", "Beefup"], dir);
  await mkdir(path.join(dir, "web"), { recursive: true });
  await writeFile(path.join(dir, "web", "package.json"), "{}\n");
  await writeFile(
    path.join(dir, "web", "package-lock.json"),
    LargerThanExecMaxBuffer
  );
  await git(["add", "."], dir);
  await git(["commit", "-m", "historic"], dir);
  return dir;
}

describe("hasNonBeefupWorkingTreeChanges", () => {
  it("treats an empty status as clean", () => {
    assert.equal(hasNonBeefupWorkingTreeChanges(""), false);
  });

  it("ignores untracked .beefup files and the collapsed directory", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/staged/package.json`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `?? ${BEEFUP_DIR}/\n?? ${BEEFUP_DIR}/report/REPORT.md`
      ),
      false
    );
  });

  it("ignores untracked files under a nested .beefup directory", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? apps/web/${BEEFUP_DIR}/staged/package.json`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? apps/web/${BEEFUP_DIR}/`),
      false
    );
  });

  it("ignores dirty files outside the current package subtree", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges("?? apps/api/package.json", "apps/web"),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(" M apps/web/package.json", "apps/web"),
      true
    );
  });

  it("detects untracked or modified files outside .beefup", () => {
    assert.equal(hasNonBeefupWorkingTreeChanges("?? dirty.txt"), true);
    assert.equal(hasNonBeefupWorkingTreeChanges(" M package.json"), true);
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/\n?? dirty.txt`),
      true
    );
  });

  it("ignores quoted .beefup paths and rename-only moves inside .beefup", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? "${BEEFUP_DIR}/staged/package.json"`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  ${BEEFUP_DIR}/old.txt -> ${BEEFUP_DIR}/new.txt`
      ),
      false
    );
  });

  it("treats a rename that leaves or enters .beefup as dirty", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  package.json -> ${BEEFUP_DIR}/package.json`
      ),
      true
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  ${BEEFUP_DIR}/package.json -> package.json`
      ),
      true
    );
  });
});

describe("gitShowFile", () => {
  it("returns nested lockfile contents larger than Node's execFile maxBuffer", async () => {
    const dir = await initRepoWithLargeLockfile();
    try {
      const contents = await gitShowFile(
        GitRefs.Head,
        "web/package-lock.json",
        dir
      );
      assert.equal(contents, LargerThanExecMaxBuffer);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when the path is not in the revision", async () => {
    const dir = await initRepoWithLargeLockfile();
    try {
      const contents = await gitShowFile(
        GitRefs.Head,
        "web/missing-lock.json",
        dir
      );
      assert.equal(contents, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws when the git ref does not exist", async () => {
    const dir = await initRepoWithLargeLockfile();
    try {
      await assert.rejects(
        () => gitShowFile("no-such-ref", "web/package-lock.json", dir),
        (error: unknown) => {
          assert.ok(error instanceof BeefupError);
          assert.match(error.message, /failed to read/);
          return true;
        }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
