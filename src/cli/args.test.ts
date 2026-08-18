import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCliArgs } from "./args.js";
import { BeefupError } from "../errors.js";

describe("parseCliArgs", () => {
  it("defaults to worktree strategy and text format", () => {
    const args = parseCliArgs(["node", "beefup", "stage"]);
    assert.equal(args.command, "stage");
    assert.equal(args.strategy, "worktree");
    assert.equal(args.format, "text");
    assert.equal(args.mode, undefined);
  });

  it("parses mode, strategy, dir, and format", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      "stage",
      "--mode",
      "latest",
      "--strategy",
      "inplace",
      "--dir",
      "/tmp/proj",
      "--format",
      "markdown",
    ]);
    assert.equal(args.mode, "latest");
    assert.equal(args.strategy, "inplace");
    assert.equal(args.dir, "/tmp/proj");
    assert.equal(args.format, "markdown");
  });

  it("rejects invalid strategy", () => {
    assert.throws(
      () => parseCliArgs(["node", "beefup", "stage", "--strategy", "copy"]),
      BeefupError
    );
  });
});
