import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BeefupError } from "../errors.js";
import { removePath } from "../fsutil.js";
import { resolveCveLiteBin } from "../pm/cve-lite-bin.js";
import type { ProcessRunner, RunResult } from "../pm/runner.js";
import { PackageManagers, type PackageManager } from "../project/types.js";
import { mergeFindings, type SecurityFinding } from "./classify.js";
import { parseCveLiteJson } from "./cve-lite.js";
import { parseNpmAuditJson } from "./npm-audit.js";

/** Filename prefix cve-lite writes when invoked with `--json`. */
const CveLiteScanFilePrefix = "cve-lite-scan-";

/**
 * True when `raw` parses as JSON (object or array).
 */
function isJsonPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a short preview of scanner output for error messages.
 */
function outputSnippet(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 200) {
    return trimmed || "(empty)";
  }
  return `${trimmed.slice(0, 200)}…`;
}

/**
 * Reads cve-lite `--json` output from stdout/stderr, or from the scan file it
 * writes to cwd (`cve-lite-scan-*.json`) because the CLI does not print JSON.
 */
async function readCveLiteJsonPayload(
  cwd: string,
  result: RunResult
): Promise<string> {
  const printed = result.stdout || result.stderr;
  if (isJsonPayload(printed)) {
    return printed;
  }
  const names = (await readdir(cwd)).filter(
    (name) => name.startsWith(CveLiteScanFilePrefix) && name.endsWith(".json")
  );
  names.sort();
  const latest = names[names.length - 1];
  if (!latest) {
    throw new BeefupError(
      `cve-lite --json produced no JSON (output: ${outputSnippet(printed)})`
    );
  }
  return readFile(path.join(cwd, latest), "utf8");
}

/**
 * Runs cve-lite against `projectRoot` with cwd isolated so scan files are not
 * written into the live or staged tree.
 */
async function scanWithCveLite(
  projectRoot: string,
  runner: ProcessRunner
): Promise<SecurityFinding[]> {
  const cveBin = await resolveCveLiteBin();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "beefup-cve-"));
  try {
    const result = await runner.run(cveBin, [projectRoot, "--json"], tmp);
    const raw = await readCveLiteJsonPayload(tmp, result);
    return parseCveLiteJson(raw);
  } finally {
    await removePath(tmp);
  }
}

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
  const projectRoot = path.resolve(options.root);
  const auditArgs = [
    ...options.prefixArgs,
    ...(options.packageManager === PackageManagers.Npm
      ? ["audit", "--json", "--package-lock-only"]
      : ["audit", "--json"]),
  ];
  const audit = await options.runner.run(options.pmBin, auditArgs, projectRoot);
  const auditRaw = audit.stdout || audit.stderr;
  if (auditRaw.trim() && !isJsonPayload(auditRaw)) {
    throw new BeefupError(
      `audit --json did not return JSON (output: ${outputSnippet(auditRaw)})`
    );
  }
  const auditFindings = parseNpmAuditJson(auditRaw);

  let cveFindings: SecurityFinding[] = [];
  try {
    cveFindings = await scanWithCveLite(projectRoot, options.runner);
  } catch (error) {
    if (error instanceof BeefupError) {
      throw error;
    }
    throw new BeefupError(
      `cve-lite scan failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return mergeFindings([...auditFindings, ...cveFindings]);
}
