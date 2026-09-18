import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAccept } from "../commands/accept.js";
import { printReport, runReport } from "../commands/report.js";
import { runRevert } from "../commands/revert.js";
import { runRewind } from "../commands/rewind.js";
import { runStage } from "../commands/stage.js";
import {
  CliCommands,
  ReportComparisons,
  StageStrategies,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { BEEFUP_DIR, BeefupSnapshots } from "../project/paths.js";
import type { StageReport } from "../report/types.js";
import { parseCliArgs, showHelp } from "./args.js";

/**
 * Reads the package version from the nearest package.json for `--version`.
 */
async function readVersion(): Promise<string> {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

/**
 * Writes a stage/report result to stdout and warns if new CVEs were introduced.
 */
function emitReport(report: StageReport): void {
  process.stdout.write(printReport(report));
  if (report.security.introduced.length > 0) {
    const review =
      report.comparison === ReportComparisons.Applied
        ? `${BEEFUP_DIR}/${BeefupSnapshots.Prior} vs the live tree`
        : `${BEEFUP_DIR}/${BeefupSnapshots.Staged} before accept`;
    console.error(
      `warning: ${report.security.introduced.length} CVE(s) introduced; review ${review}`
    );
  }
}

/**
 * CLI entrypoint: parses argv, runs a Beefup command, and returns a process exit code.
 */
export async function main(argv = process.argv): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    if (args.version) {
      console.log(await readVersion());
      return 0;
    }
    if (args.help || !args.command) {
      console.log(showHelp());
      return 0;
    }

    const projectRoot = args.dir ?? process.cwd();
    if (args.command === CliCommands.Stage) {
      const report = await runStage({
        projectRoot,
        packageRoot: args.packageRoot,
        mode: args.mode,
        strategy: args.strategy ?? StageStrategies.Worktree,
        format: args.format,
      });
      emitReport(report);
      return 0;
    }
    if (args.command === CliCommands.Report) {
      const report = await runReport({
        projectRoot,
        packageRoot: args.packageRoot,
        mode: args.mode,
        strategy: args.strategy,
        format: args.format,
      });
      emitReport(report);
      return 0;
    }
    if (args.command === CliCommands.Accept) {
      const result = await runAccept({
        projectRoot,
        packageRoot: args.packageRoot,
        format: args.format,
      });
      process.stdout.write(
        `Accepted staged upgrade. Applied ${result.copied.join(", ")} and installed from the frozen lockfile (${result.packageManager}).\n`
      );
      for (const warning of result.warnings) {
        console.error(`warning: ${warning}`);
      }
      return 0;
    }
    if (args.command === CliCommands.Revert) {
      const result = await runRevert({
        projectRoot,
        packageRoot: args.packageRoot,
        format: args.format,
      });
      process.stdout.write(
        `Reverted to ${BEEFUP_DIR}/${BeefupSnapshots.Prior}. Applied ${result.copied.join(", ")} and installed from the frozen lockfile (${result.packageManager}).\n`
      );
      return 0;
    }
    if (args.command === CliCommands.Rewind) {
      const report = await runRewind({
        projectRoot,
        packageRoot: args.packageRoot,
        gitRef: args.gitRef ?? "",
        format: args.format,
      });
      emitReport(report);
      return 0;
    }

    throw new BeefupError(`unknown command: ${args.command}`);
  } catch (error) {
    if (error instanceof BeefupError) {
      console.error(`error: ${error.message}`);
      return error.exitCode;
    }
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
