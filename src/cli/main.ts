import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAccept } from "../commands/accept.js";
import { printReport, runReport } from "../commands/report.js";
import { runStage } from "../commands/stage.js";
import {
  CliCommands,
  StageStrategies,
  type ReportFormat,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
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
function emitReport(report: StageReport, format: ReportFormat): void {
  process.stdout.write(printReport(report, format));
  if (report.security.introduced.length > 0) {
    console.error(
      `warning: ${report.security.introduced.length} CVE(s) introduced; review .beefup/staged before accept`
    );
  }
}

/**
 * CLI entrypoint: parses argv, runs stage, report, or accept, and returns a process exit code.
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
        mode: args.mode,
        strategy: args.strategy ?? StageStrategies.Worktree,
        format: args.format,
      });
      emitReport(report, args.format);
      return 0;
    }
    if (args.command === CliCommands.Report) {
      const report = await runReport({
        projectRoot,
        mode: args.mode,
        strategy: args.strategy,
        format: args.format,
      });
      emitReport(report, args.format);
      return 0;
    }
    if (args.command === CliCommands.Accept) {
      const result = await runAccept({ projectRoot });
      process.stdout.write(
        `Accepted staged upgrade. Applied ${result.copied.join(", ")} and installed from the frozen lockfile (${result.packageManager}).\n`
      );
      for (const warning of result.warnings) {
        console.error(`warning: ${warning}`);
      }
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
