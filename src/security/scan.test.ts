import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { BeefupError } from "../errors.js";
import type { ProcessRunner } from "../pm/runner.js";
import { PackageManagers } from "../project/types.js";
import { SecuritySources } from "./classify.js";
import { urlForGhsa } from "./refs.js";
import { scanProject } from "./scan.js";

/**
 * Builds a ProcessRunner that returns pnpm-style audit JSON and writes a
 * cve-lite scan file into cwd (the CLI does not print JSON to stdout).
 */
function fileBackedRunner(): ProcessRunner {
  return {
    async run(_bin, args, cwd) {
      if (args.includes("audit")) {
        return {
          stdout: JSON.stringify({
            advisories: {
              "1123526": {
                id: 1123526,
                title: "vite: server.fs.deny bypass",
                module_name: "vite",
                severity: "high",
                github_advisory_id: "GHSA-fx2h-pf6j-xcff",
                url: urlForGhsa("GHSA-fx2h-pf6j-xcff"),
                findings: [{ version: "7.3.2" }],
              },
            },
          }),
          stderr: "",
          code: 1,
        };
      }
      const filename = "cve-lite-scan-2026-01-01T00-00-00.json";
      await writeFile(
        path.join(cwd, filename),
        JSON.stringify({
          findings: [
            {
              package: "qs",
              version: "6.15.2",
              severity: "medium",
              vulnerabilities: [
                {
                  id: "GHSA-x5fp-wj9c-mxmx",
                  aliases: ["CVE-2026-1"],
                  summary: "qs issue",
                  severity: "medium",
                },
              ],
            },
          ],
        })
      );
      return { stdout: `JSON saved to ${filename}\n`, stderr: "", code: 0 };
    },
  };
}

describe("scanProject", () => {
  it("parses pnpm advisories JSON and cve-lite scan files written to cwd", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-scan-"));
    const findings = await scanProject({
      root: dir,
      packageManager: PackageManagers.Pnpm,
      pmBin: "pnpm",
      prefixArgs: [],
      runner: fileBackedRunner(),
    });
    const ids = findings.map((item) => item.id).sort();
    assert.deepEqual(ids, ["GHSA-fx2h-pf6j-xcff", "GHSA-x5fp-wj9c-mxmx"]);
  });

  it("records both scanners when audit and cve-lite share an id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-scan-"));
    const runner: ProcessRunner = {
      async run(_bin, args, cwd) {
        if (args.includes("audit")) {
          return {
            stdout: JSON.stringify({
              advisories: {
                "1123526": {
                  id: 1123526,
                  title: "vite: server.fs.deny bypass",
                  module_name: "vite",
                  severity: "high",
                  github_advisory_id: "GHSA-fx2h-pf6j-xcff",
                  url: urlForGhsa("GHSA-fx2h-pf6j-xcff"),
                  findings: [{ version: "7.3.2" }],
                },
              },
            }),
            stderr: "",
            code: 1,
          };
        }
        const filename = "cve-lite-scan-2026-01-01T00-00-00.json";
        await writeFile(
          path.join(cwd, filename),
          JSON.stringify({
            findings: [
              {
                package: "vite",
                version: "7.3.2",
                severity: "high",
                vulnerabilities: [
                  {
                    id: "GHSA-fx2h-pf6j-xcff",
                    aliases: ["CVE-2026-53571"],
                    summary: "vite: server.fs.deny bypass",
                    severity: "high",
                  },
                ],
              },
            ],
          })
        );
        return { stdout: `JSON saved to ${filename}\n`, stderr: "", code: 0 };
      },
    };
    const findings = await scanProject({
      root: dir,
      packageManager: PackageManagers.Pnpm,
      pmBin: "pnpm",
      prefixArgs: [],
      runner,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.id, "GHSA-fx2h-pf6j-xcff");
    assert.deepEqual(findings[0]?.sources, [
      SecuritySources.NpmAudit,
      SecuritySources.CveLite,
    ]);
  });

  it("throws when audit --json prints non-JSON text", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-scan-"));
    const runner: ProcessRunner = {
      async run(_bin, args) {
        if (args.includes("audit")) {
          return { stdout: "audit failed: network error", stderr: "", code: 1 };
        }
        return { stdout: "[]", stderr: "", code: 0 };
      },
    };
    await assert.rejects(
      () =>
        scanProject({
          root: dir,
          packageManager: PackageManagers.Pnpm,
          pmBin: "pnpm",
          prefixArgs: [],
          runner,
        }),
      BeefupError
    );
  });
});
