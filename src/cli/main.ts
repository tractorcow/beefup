import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { printReport, runStage } from "../commands/stage.js";
import { BeefupError } from "../errors.js";
import { parseCliArgs, showHelp } from "./args.js";

async function readVersion(): Promise<string> {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

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
    if (args.command !== "stage") {
      throw new BeefupError(`unknown command: ${args.command}`);
    }
    const report = await runStage({
      projectRoot: args.dir ?? process.cwd(),
      mode: args.mode,
      strategy: args.strategy,
      format: args.format,
    });
    process.stdout.write(printReport(report, args.format));
    if (report.security.introduced.length > 0) {
      console.error(
        `warning: ${report.security.introduced.length} CVE(s) introduced; review .beefup/staged before accept`
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof BeefupError) {
      console.error(`error: ${error.message}`);
      return error.exitCode;
    }
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
