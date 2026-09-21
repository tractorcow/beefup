import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CliCommands,
  CliOptionFlags,
  LogLevels,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { parseCliArgs, showHelp } from "./args.js";

describe("parseCliArgs", () => {
  it("defaults to html format and leaves strategy unset", () => {
    const args = parseCliArgs(["node", "beefup", CliCommands.Stage]);
    assert.equal(args.command, CliCommands.Stage);
    assert.equal(args.strategy, undefined);
    assert.equal(args.format, ReportFormats.Html);
    assert.equal(args.mode, undefined);
    assert.equal(args.noSafeChain, false);
    assert.equal(args.logLevel, LogLevels.Warn);
  });

  it("parses --no-safe-chain", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Stage,
      CliOptionFlags.NoSafeChain,
    ]);
    assert.equal(args.noSafeChain, true);
  });

  it("parses report command", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Report,
      "--format",
      ReportFormats.Markdown,
    ]);
    assert.equal(args.command, CliCommands.Report);
    assert.equal(args.format, ReportFormats.Markdown);
  });

  it("rejects json and color report formats", () => {
    assert.throws(
      () =>
        parseCliArgs([
          "node",
          "beefup",
          CliCommands.Report,
          "--format",
          "json",
        ]),
      BeefupError
    );
    assert.throws(
      () =>
        parseCliArgs([
          "node",
          "beefup",
          CliCommands.Report,
          "--format",
          "color",
        ]),
      BeefupError
    );
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

  it("parses rewind git ref", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Rewind,
      "HEAD~1",
      "--dir",
      "/tmp/proj",
    ]);
    assert.equal(args.command, CliCommands.Rewind);
    assert.equal(args.gitRef, "HEAD~1");
    assert.equal(args.dir, "/tmp/proj");
  });

  it("rejects rewind without a git ref", () => {
    assert.throws(
      () => parseCliArgs(["node", "beefup", CliCommands.Rewind]),
      BeefupError
    );
  });

  it("lists revert and rewind in help text", () => {
    const help = showHelp();
    assert.match(help, new RegExp(`\\b${CliCommands.Revert}\\b`));
    assert.match(help, new RegExp(`\\b${CliCommands.Rewind}\\b`));
  });

  it("parses package-root", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Stage,
      CliOptionFlags.PackageRoot,
      "./app",
    ]);
    assert.equal(args.packageRoot?.[0], "./app");
    assert.equal(args.packageRoot?.length, 1);
  });

  it("parses repeated --package-root flags", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Stage,
      CliOptionFlags.PackageRoot,
      "./app",
      CliOptionFlags.PackageRoot,
      "./api",
    ]);
    assert.deepEqual(args.packageRoot, ["./app", "./api"]);
  });

  it("lists package-root in help text", () => {
    assert.match(showHelp(), new RegExp(CliOptionFlags.PackageRoot));
  });

  it("lists --no-safe-chain in help text", () => {
    assert.match(showHelp(), new RegExp(CliOptionFlags.NoSafeChain));
  });

  it("parses quiet, verbose, debug, and log-level", () => {
    assert.equal(
      parseCliArgs([
        "node",
        "beefup",
        CliCommands.Stage,
        CliOptionFlags.Quiet,
      ]).logLevel,
      LogLevels.Quiet
    );
    assert.equal(
      parseCliArgs([
        "node",
        "beefup",
        CliCommands.Stage,
        CliOptionFlags.VerboseShort,
      ]).logLevel,
      LogLevels.Info
    );
    assert.equal(
      parseCliArgs([
        "node",
        "beefup",
        CliCommands.Stage,
        CliOptionFlags.Debug,
      ]).logLevel,
      LogLevels.Debug
    );
    assert.equal(
      parseCliArgs([
        "node",
        "beefup",
        CliCommands.Stage,
        CliOptionFlags.LogLevel,
        LogLevels.Info,
      ]).logLevel,
      LogLevels.Info
    );
  });

  it("lets the last verbosity flag win", () => {
    const args = parseCliArgs([
      "node",
      "beefup",
      CliCommands.Stage,
      CliOptionFlags.Quiet,
      CliOptionFlags.Debug,
      CliOptionFlags.Verbose,
    ]);
    assert.equal(args.logLevel, LogLevels.Info);
  });

  it("rejects an invalid log-level", () => {
    assert.throws(
      () =>
        parseCliArgs([
          "node",
          "beefup",
          CliCommands.Stage,
          CliOptionFlags.LogLevel,
          "trace",
        ]),
      BeefupError
    );
  });

  it("lists verbosity flags in help text", () => {
    const help = showHelp();
    assert.match(help, new RegExp(CliOptionFlags.Quiet));
    assert.match(help, new RegExp(CliOptionFlags.Verbose));
    assert.match(help, new RegExp(CliOptionFlags.Debug));
    assert.match(help, new RegExp(CliOptionFlags.LogLevel));
  });

  it("lists html markdown and text report formats in help", () => {
    const help = showHelp();
    assert.match(help, new RegExp(`\\b${ReportFormats.Html}\\b`));
    assert.match(help, new RegExp(`\\b${ReportFormats.Markdown}\\b`));
    assert.match(help, new RegExp(`\\b${ReportFormats.Text}\\b`));
    assert.doesNotMatch(help, /\bcolor\b/);
    assert.doesNotMatch(help, /--format json/);
  });
});
