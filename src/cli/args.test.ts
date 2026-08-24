import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CliCommands,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { parseCliArgs, showHelp } from "./args.js";

describe("parseCliArgs", () => {
  it("defaults to color format and leaves strategy unset", () => {
    const args = parseCliArgs(["node", "beefup", CliCommands.Stage]);
    assert.equal(args.command, CliCommands.Stage);
    assert.equal(args.strategy, undefined);
    assert.equal(args.format, ReportFormats.Color);
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

  it("parses accept command", () => {
    const args = parseCliArgs(["node", "beefup", CliCommands.Accept, "--dir", "/tmp/proj"]);
    assert.equal(args.command, CliCommands.Accept);
    assert.equal(args.dir, "/tmp/proj");
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

  it("lists accept in help text", () => {
    assert.match(showHelp(), new RegExp(`\\b${CliCommands.Accept}\\b`));
  });

  it("lists color and html report formats in help", () => {
    const help = showHelp();
    assert.match(help, new RegExp(`\\b${ReportFormats.Color}\\b`));
    assert.match(help, new RegExp(`\\b${ReportFormats.Html}\\b`));
  });
});
