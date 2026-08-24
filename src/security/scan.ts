import { BeefupError } from "../errors.js";
import { resolveCveLiteBin } from "../pm/cve-lite-bin.js";
import type { ProcessRunner } from "../pm/runner.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import type { SecurityFinding } from "./classify.js";
import { parseCveLiteJson } from "./cve-lite.js";
import { parseNpmAuditJson } from "./npm-audit.js";

/**
 * Runs npm/pnpm audit and cve-lite against a project root and merges findings.
 */
export async function scanProject(options: {
  root: string;
  packageManager: PackageManager;
  pmBin: string;
  prefixArgs: string[];
  runner: ProcessRunner;
}): Promise<SecurityFinding[]> {
  const auditArgs = [
    ...options.prefixArgs,
    ...(options.packageManager === PackageManagers.Npm
      ? ["audit", "--json", "--package-lock-only"]
      : ["audit", "--json"]),
  ];
  const audit = await options.runner.run(options.pmBin, auditArgs, options.root);
  const auditFindings = parseNpmAuditJson(audit.stdout || audit.stderr);

  let cveFindings: SecurityFinding[] = [];
  try {
    const cveBin = await resolveCveLiteBin();
    const cve = await options.runner.run(
      cveBin,
      [options.root, "--json"],
      options.root
    );
    cveFindings = parseCveLiteJson(cve.stdout || cve.stderr);
  } catch (error) {
    if (error instanceof BeefupError) {
      throw error;
    }
    throw new BeefupError(
      `cve-lite scan failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return [...auditFindings, ...cveFindings];
}
