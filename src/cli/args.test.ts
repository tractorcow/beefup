import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CliCommands,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { parseCliArgs } from "./args.js";

describe("parseCliArgs", () => {
  it("defaults to text format and leaves strategy unset", () => {
    const args = parseCliArgs(["node", "beefup", CliCommands.Stage]);
    assert.equal(args.command, CliCommands.Stage);
    assert.equal(args.strategy, undefined);
    assert.equal(args.format, ReportFormats.Text);
    assert.equal(args.mode, undefined);
  });

  it("parses report command", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Report,
      "--format",
      ReportFormats.Json,
    ]);
    assert.equal(args.command, CliCommands.Report);
    assert.equal(args.format, ReportFormats.Json);
  });

  it("parses mode, strategy, dir, and format", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Stage,
      "--mode",
      UpgradeModes.Latest,
      "--strategy",
      StageStrategies.Inplace,
      "--dir",
      "/tmp/proj",
      "--format",
      ReportFormats.Markdown,
    ]);
    assert.equal(args.mode, UpgradeModes.Latest);
    assert.equal(args.strategy, StageStrategies.Inplace);
    assert.equal(args.dir, "/tmp/proj");
    assert.equal(args.format, ReportFormats.Markdown);
  });

  it("rejects invalid strategy", () => {
    assert.throws(
      () => parseCliArgs(["node", "beefup", CliCommands.Stage, "--strategy", "copy"]),
      BeefupError
    );
  });
});
