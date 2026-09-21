import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LogLevels } from "./config/types.js";
import {
  createLogger,
  formatBytes,
  formatDuration,
  LogPrefixes,
} from "./log.js";

/**
 * Builds a logger that appends lines into `lines`.
 */
function capturingLogger(
  level: (typeof LogLevels)[keyof typeof LogLevels],
  lines: string[]
) {
  return createLogger({
    level,
    write: (line) => {
      lines.push(line);
    },
  });
}

describe("createLogger", () => {
  it("always writes errors, even at quiet", () => {
    const lines: string[] = [];
    const log = capturingLogger(LogLevels.Quiet, lines);
    log.error("boom");
    log.warn("hidden");
    log.info("hidden");
    log.debug("hidden");
    assert.deepEqual(lines, [`${LogPrefixes.Error} boom\n`]);
  });

  it("writes warnings at the default warn level", () => {
    const lines: string[] = [];
    const log = capturingLogger(LogLevels.Warn, lines);
    log.warn("careful");
    log.info("hidden");
    log.debug("hidden");
    assert.deepEqual(lines, [`${LogPrefixes.Warn} careful\n`]);
  });

  it("writes info but not debug at info", () => {
    const lines: string[] = [];
    const log = capturingLogger(LogLevels.Info, lines);
    log.info("step");
    log.debug("hidden");
    assert.deepEqual(lines, [`${LogPrefixes.Info} step\n`]);
  });

  it("writes debug at debug", () => {
    const lines: string[] = [];
    const log = capturingLogger(LogLevels.Debug, lines);
    log.debug("detail");
    assert.deepEqual(lines, [`${LogPrefixes.Debug} detail\n`]);
  });

  it("records timed step start, duration, and failure", async () => {
    const lines: string[] = [];
    const log = capturingLogger(LogLevels.Info, lines);
    await log.timed("work", async () => "ok");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], `${LogPrefixes.Info} work\n`);
    assert.match(lines[1] ?? "", /info: work \(.+\)\n/);

    const failed: string[] = [];
    const failing = capturingLogger(LogLevels.Info, failed);
    await assert.rejects(
      () =>
        failing.timed("work", async () => {
          throw new Error("nope");
        }),
      /nope/
    );
    assert.equal(failed[0], `${LogPrefixes.Info} work\n`);
    assert.match(failed[1] ?? "", /info: work failed \(.+\)\n/);
  });
});

describe("formatDuration", () => {
  it("uses milliseconds below one second and seconds otherwise", () => {
    assert.equal(formatDuration(12.4), "12ms");
    assert.equal(formatDuration(1500), "1.5s");
  });
});

describe("formatBytes", () => {
  it("uses B, KiB, and MiB thresholds", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2.0 KiB");
    assert.equal(formatBytes(1024 * 1024), "1.0 MiB");
  });
});
