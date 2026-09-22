import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { withSafeChainStubs } from "../__tests__/with-safe-chain-stubs.js";
import { runReport } from "../commands/report.js";
import {
  DefaultPackageRoot,
  ReportComparisons,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
} from "../config/types.js";
import { PackageChangeTypes } from "../diff/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, removePath, writeJsonFile } from "../fsutil.js";
import type { ProcessRunner } from "../pm/runner.js";
import { BEEFUP_DIR, priorDir, ReportFileNames, stagedDir } from "../project/paths.js";
import { PackageManagers } from "../project/types.js";
import { Ansi, ansiForSeverity, paint } from "../report/ansi.js";
import { renderHtml } from "../report/html.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderText } from "../report/text.js";
import type { StageReport } from "../report/types.js";
import {
  FindingSeverities,
  SecuritySources,
} from "../security/classify.js";
import { META_VULN_TITLE } from "../security/npm-audit.js";
import { AdvisoryRefKinds, urlForGhsa } from "../security/refs.js";

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

  const staged = path.join(dir, BEEFUP_DIR, "staged");
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
  await writeJsonFile(path.join(dir, BEEFUP_DIR, "report", ReportFileNames.Json), {
    mode: UpgradeModes.Latest,
    strategy: StageStrategies.Inplace,
    packageManager: PackageManagers.Pnpm,
    diff: { dependencies: [], devDependencies: [] },
    ranges: [],
    overrides: [],
    alignment: [],
    security: { fixed: [], introduced: [], unresolved: [] },
    warnings: [],
  } satisfies StageReport);
}

describe("runReport", () => {
  it("regenerates REPORT.html and report.json from an existing staged upgrade", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-"));
      await seedStagedProject(dir);
      try {
        const report = await runReport({
          projectRoot: dir,
          format: ReportFormats.Html,
          runner,
        });
        assert.equal(report.strategy, StageStrategies.Inplace);
        assert.equal(report.mode, UpgradeModes.Latest);
        assert.equal(report.comparison, ReportComparisons.Proposal);
        const upgraded = report.diff.dependencies.filter(
          (change) => change.name === "leftpad"
        );
        assert.equal(upgraded.length, 1);
        assert.deepEqual(
          upgraded[0]?.from.map((item) => item.version),
          ["1.0.0"]
        );
        assert.deepEqual(
          upgraded[0]?.to.map((item) => item.version),
          ["1.3.0"]
        );

        assert.equal(upgraded[0]?.direct, true);
        assert.ok(report.generatedAt);
        assert.ok(report.beefupVersion);

        const html = await readFile(
          path.join(dir, BEEFUP_DIR, "report", ReportFileNames.Html),
          "utf8"
        );
        assert.match(html, /<h2>Summary<\/h2>/);
        assert.match(html, /<h2>Security<\/h2>/);
        assert.match(html, /<strong>leftpad<\/strong>/);
        assert.match(html, /<h2>Legend<\/h2>/);
        assert.match(html, /\.beefup\/staged/);
        assert.match(html, /Beefup:/);
        assert.match(html, /Generated:/);
        const summaryIdx = html.indexOf("<h2>Summary</h2>");
        const securityIdx = html.indexOf("<h2>Security</h2>");
        const depsIdx = html.indexOf("<h2>Dependencies</h2>");
        const legendIdx = html.indexOf("<h2>Legend</h2>");
        assert.ok(summaryIdx >= 0 && securityIdx > summaryIdx);
        assert.ok(depsIdx < 0 || depsIdx > securityIdx);
        assert.ok(legendIdx > securityIdx);
        assert.match(html, /<details open>/);
        assert.match(html, /Changed Packages \(1\)/);
        const json = JSON.parse(
          await readFile(
            path.join(dir, BEEFUP_DIR, "report", ReportFileNames.Json),
            "utf8"
          )
        ) as StageReport;
        assert.equal(json.strategy, StageStrategies.Inplace);
        assert.ok(json.generatedAt);
        assert.ok(json.beefupVersion);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("writes REPORT.md and removes REPORT.html when format is markdown", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-md-"));
      await seedStagedProject(dir);
      const reports = path.join(dir, BEEFUP_DIR, "report");
      await writeFile(path.join(reports, ReportFileNames.Html), "<html></html>", "utf8");
      try {
        await runReport({
          projectRoot: dir,
          format: ReportFormats.Markdown,
          runner,
        });
        const markdown = await readFile(
          path.join(reports, ReportFileNames.Markdown),
          "utf8"
        );
        assert.match(markdown, /## Summary/);
        assert.equal(await pathExists(path.join(reports, ReportFileNames.Html)), false);
        assert.equal(await pathExists(path.join(reports, ReportFileNames.Json)), true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("renders optional sections, single-column add/remove, titles, and meta-vuln labels", () => {
    const report: StageReport = {
      mode: UpgradeModes.Latest,
      strategy: StageStrategies.Inplace,
      packageManager: PackageManagers.Npm,
      generatedAt: "2026-08-24T00:00:00.000Z",
      beefupVersion: "0.1.0",
      diff: {
        dependencies: [
          {
            name: "leftpad",
            type: PackageChangeTypes.Changed,
            from: [{ path: "node_modules/leftpad", version: "1.0.0" }],
            to: [{ path: "node_modules/leftpad", version: "1.3.0" }],
            direct: true,
          },
          {
            name: "fsevents",
            type: PackageChangeTypes.Changed,
            from: [{ path: "node_modules/fsevents", version: "2.0.0" }],
            to: [{ path: "node_modules/fsevents", version: "2.1.0" }],
            optional: true,
          },
          {
            name: "react",
            type: PackageChangeTypes.Added,
            from: [],
            to: [{ path: "node_modules/react", version: "18.0.0" }],
            direct: true,
          },
          {
            name: "axios",
            type: PackageChangeTypes.Removed,
            from: [{ path: "node_modules/axios", version: "0.21.0" }],
            to: [],
          },
        ],
        devDependencies: [],
      },
      ranges: [],
      overrides: [],
      alignment: [],
      security: {
        fixed: [],
        introduced: [
          {
            id: "GHSA-35jh-r3h4-6jhm",
            refs: [
              {
                kind: AdvisoryRefKinds.Ghsa,
                id: "GHSA-35jh-r3h4-6jhm",
                url: urlForGhsa("GHSA-35jh-r3h4-6jhm"),
              },
            ],
            packageName: "lodash",
            severity: FindingSeverities.High,
            sources: [SecuritySources.NpmAudit],
            title: "Prototype pollution",
          },
          {
            id: "npm:my-app",
            refs: [],
            viaPackages: ["lodash"],
            packageName: "my-app",
            severity: FindingSeverities.High,
            sources: [SecuritySources.NpmAudit],
            title: META_VULN_TITLE,
          },
        ],
        unresolved: [],
      },
      warnings: [],
    };

    const markdown = renderMarkdown(report);
    const introducedIdx = markdown.indexOf("### Introduced");
    const unresolvedIdx = markdown.indexOf("### Unresolved");
    const fixedIdx = markdown.indexOf("### Fixed");
    assert.ok(introducedIdx >= 0);
    assert.equal(unresolvedIdx, -1);
    assert.equal(fixedIdx, -1);
    assert.match(markdown, /regressions/);
    assert.match(markdown, /2 security findings introduced — review before accept/);
    assert.doesNotMatch(markdown, /CVE\(s\)/);
    assert.doesNotMatch(markdown, /remain open risk/);
    assert.match(markdown, /\| Severity \| Title \| References \| Package \| Scanners \|/);
    assert.match(markdown, /npm-audit/);
    assert.match(markdown, /Prototype pollution/);
    assert.match(markdown, /transitive \(via `lodash`\)/);
    assert.match(markdown, /### Optional \/ platform \(1\)/);
    assert.match(markdown, /\*fsevents\*/);
    assert.match(
      markdown,
      /<summary>Added Packages \(1\)<\/summary>\n\n\| Package \| Version \|/
    );
    assert.match(markdown, /\| \*\*react\*\* \| `18\.0\.0` \|/);
    assert.match(
      markdown,
      /<summary>Removed Packages \(1\)<\/summary>\n\n\| Package \| Version \|/
    );
    assert.match(markdown, /\| \*axios\* \| `0\.21\.0` \|/);
    assert.match(markdown, /## Legend/);
    assert.doesNotMatch(markdown, /Package root:/);

    const text = renderText(report);
    assert.match(text, /\[D\].*leftpad/);
    assert.match(text, /\[optional\].*fsevents/);
    assert.match(text, /Legend: \[D\]=direct, \[T\]=transitive/);
    assert.match(text, /transitive \(via lodash\)/);
    assert.equal(text.includes(Ansi.Red), false);

    const colored = renderText(report, { color: true });
    assert.ok(colored.includes(`${Ansi.Red}1.0.0${Ansi.Reset}`));
    assert.ok(colored.includes(`${Ansi.Green}1.3.0${Ansi.Reset}`));
    assert.ok(
      colored.includes(
        paint(ansiForSeverity(FindingSeverities.High), FindingSeverities.High, true)
      )
    );

    const html = renderHtml(report);
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /class="ver-from"/);
    assert.match(html, /class="ver-to"/);
    assert.match(html, /class="badge sev-high"/);
    assert.match(html, /<strong>leftpad<\/strong>/);
    assert.match(html, /<em>fsevents<\/em>/);
    assert.match(html, /<strong>react<\/strong>/);
    assert.match(html, /<em>axios<\/em>/);
    assert.match(html, /transitive \(via <code>lodash<\/code>\)/);
    assert.match(html, /Optional \/ platform \(1\)/);
    const injected = renderHtml({
      ...report,
      security: {
        ...report.security,
        introduced: [
          {
            ...report.security.introduced[0]!,
            title: `<script>alert(1)</script>`,
            packageName: `pkg"onclick`,
          },
        ],
      },
    });
    assert.doesNotMatch(injected, /<script>alert/);
    assert.match(injected, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(injected, /pkg&quot;onclick/);
  });

  it("uses applied wording for prior-vs-live reports", () => {
    const report: StageReport = {
      mode: UpgradeModes.SameMajor,
      strategy: StageStrategies.Worktree,
      packageManager: PackageManagers.Npm,
      comparison: ReportComparisons.Applied,
      packageRoot: "packages/watercare-cms",
      generatedAt: "2026-08-24T00:00:00.000Z",
      beefupVersion: "0.1.0",
      diff: { dependencies: [], devDependencies: [] },
      ranges: [],
      overrides: [],
      alignment: [],
      security: {
        fixed: [],
        introduced: [
          {
            id: "CVE-1",
            refs: [],
            packageName: "leftpad",
            severity: FindingSeverities.High,
            sources: [SecuritySources.NpmAudit],
            title: "example",
          },
        ],
        unresolved: [],
      },
      warnings: [],
    };
    const markdown = renderMarkdown(report);
    assert.match(markdown, /1 security finding introduced versus prior/);
    assert.doesNotMatch(markdown, /review before accept/);
    assert.doesNotMatch(markdown, /staged upgrade/);
    assert.match(markdown, /historic lockfile/);
    assert.match(markdown, /Package root: `packages\/watercare-cms`/);
    const text = renderText(report);
    assert.match(text, /Package root: packages\/watercare-cms/);
    const html = renderHtml(report);
    assert.match(html, /Package root: <code>packages\/watercare-cms<\/code>/);
    assert.doesNotMatch(
      renderMarkdown({ ...report, packageRoot: DefaultPackageRoot }),
      /Package root:/
    );
  });

  it("compares prior vs live when only a prior snapshot exists", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-applied-"));
      await seedStagedProject(dir);
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        version: "1.0.0",
        dependencies: { leftpad: "1.3.0" },
      });
      await writeFile(
        path.join(dir, "pnpm-lock.yaml"),
        await readFile(path.join(stagedDir(dir), "pnpm-lock.yaml"), "utf8")
      );
      await writeJsonFile(path.join(priorDir(dir), "package.json"), {
        name: "demo",
        version: "1.0.0",
        dependencies: { leftpad: "1.0.0" },
      });
      await writeFile(
        path.join(priorDir(dir), "pnpm-lock.yaml"),
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
      await removePath(stagedDir(dir));
      try {
        const report = await runReport({
          projectRoot: dir,
          format: ReportFormats.Html,
          runner,
        });
        assert.equal(report.comparison, ReportComparisons.Applied);
        const upgraded = report.diff.dependencies.filter(
          (change) => change.name === "leftpad"
        );
        assert.equal(upgraded.length, 1);
        assert.deepEqual(
          upgraded[0]?.from.map((item) => item.version),
          ["1.0.0"]
        );
        assert.deepEqual(
          upgraded[0]?.to.map((item) => item.version),
          ["1.3.0"]
        );
        const html = await readFile(
          path.join(dir, BEEFUP_DIR, "report", ReportFileNames.Html),
          "utf8"
        );
        assert.match(html, /\.beefup\/prior/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("treats a matching staged lockfile as a proposal when there is no prior", async () => {
    await withSafeChainStubs(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-report-noop-"));
      await seedStagedProject(dir);
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "demo",
        version: "1.0.0",
        dependencies: { leftpad: "1.3.0" },
      });
      await writeFile(
        path.join(dir, "pnpm-lock.yaml"),
        await readFile(path.join(stagedDir(dir), "pnpm-lock.yaml"), "utf8")
      );
      try {
        const report = await runReport({
          projectRoot: dir,
          format: ReportFormats.Text,
          runner,
        });
        assert.equal(report.comparison, ReportComparisons.Proposal);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
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
