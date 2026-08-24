import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runReport } from "../commands/report.js";
import {
  ReportFormats,
  StageStrategies,
  UpgradeModes,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { writeJsonFile } from "../fsutil.js";
import type { ProcessRunner } from "../pm/runner.js";
import { PackageManagers } from "../project/types.js";
import type { StageReport } from "../report/types.js";

const runner: ProcessRunner = {
  async run(_bin, args) {
    if (args.includes("audit")) {
      return { stdout: '{"vulnerabilities":{}}', stderr: "", code: 0 };
    }
    return { stdout: "[]", stderr: "", code: 0 };
  },
};

/**
 * Seeds a temp project with live + staged lockfiles and a prior report.json.
 */
async function seedStagedProject(dir: string): Promise<void> {
  await writeJsonFile(path.join(dir, "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.0.0" },
  });
  await writeFile(
    path.join(dir, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 1.0.0
        version: 1.0.0
packages:
  leftpad@1.0.0:
    version: 1.0.0
`
  );

  const staged = path.join(dir, ".beefup", "staged");
  await writeJsonFile(path.join(staged, "package.json"), {
    name: "demo",
    version: "1.0.0",
    dependencies: { leftpad: "1.3.0" },
  });
  await writeFile(
    path.join(staged, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leftpad:
        specifier: 1.3.0
        version: 1.3.0
packages:
  leftpad@1.3.0:
    version: 1.3.0
`
  );
  await writeJsonFile(path.join(dir, ".beefup", "report", "report.json"), {
    mode: UpgradeModes.Latest,
    strategy: StageStrategies.Inplace,
    packageManager: PackageManagers.Pnpm,
    diff: { dependencies: [], devDependencies: [] },
    ranges: [],
    overrides: [],
    alignment: [],
    security: { fixed: [], introduced: [], retained: [] },
    warnings: [],
  } satisfies StageReport);
}

describe("runReport", () => {
  it("regenerates REPORT.md and report.json from an existing staged upgrade", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-"));
    await seedStagedProject(dir);
    try {
      const report = await runReport({
        projectRoot: dir,
        format: ReportFormats.Text,
        runner,
      });
      assert.equal(report.strategy, StageStrategies.Inplace);
      assert.equal(report.mode, UpgradeModes.Latest);
      const upgraded = report.diff.dependencies.filter(
        (change) => change.name === "leftpad"
      );
      assert.equal(upgraded.length, 1);
      assert.equal(upgraded[0]?.fromVersion, "1.0.0");
      assert.equal(upgraded[0]?.toVersion, "1.3.0");

      const markdown = await readFile(path.join(dir, ".beefup", "report", "REPORT.md"), "utf8");
      assert.match(markdown, /leftpad/);
      const json = JSON.parse(
        await readFile(path.join(dir, ".beefup", "report", "report.json"), "utf8")
      ) as StageReport;
      assert.equal(json.strategy, StageStrategies.Inplace);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when no staged lockfile exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-missing-"));
    await writeJsonFile(path.join(dir, "package.json"), {
      name: "demo",
      version: "1.0.0",
    });
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    try {
      await assert.rejects(
        () =>
          runReport({
            projectRoot: dir,
            format: ReportFormats.Text,
            runner,
          }),
        BeefupError
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
