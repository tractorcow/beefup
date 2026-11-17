import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultProcessRunner, formatRunFailure } from "./runner.js";

describe("formatRunFailure", () => {
  it("includes captured output and omits an empty capture", () => {
    assert.equal(
      formatRunFailure("lockfile regeneration failed", {
        stdout: "",
        stderr: "npm error",
        code: 1,
      }),
      "lockfile regeneration failed:\nnpm error"
    );
    assert.equal(
      formatRunFailure("lockfile regeneration failed", {
        stdout: "",
        stderr: "",
        code: 1,
      }),
      "lockfile regeneration failed"
    );
  });
});

describe("defaultProcessRunner", () => {
  it("captures stdout and stderr when output is not streamed", async () => {
    const result = await defaultProcessRunner.run(
      process.execPath,
      ["-e", "process.stdout.write('out'); process.stderr.write('err');"],
      process.cwd()
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "out");
    assert.equal(result.stderr, "err");
  });

  it("inherits the terminal when stream is set", async () => {
    const parentStdoutTty = Boolean(process.stdout.isTTY);
    const parentStderrTty = Boolean(process.stderr.isTTY);
    const result = await defaultProcessRunner.run(
      process.execPath,
      [
        "-e",
        `process.exit(Boolean(process.stdout.isTTY) === ${parentStdoutTty} && Boolean(process.stderr.isTTY) === ${parentStderrTty} ? 0 : 7)`,
      ],
      process.cwd(),
      { stream: true }
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
});
