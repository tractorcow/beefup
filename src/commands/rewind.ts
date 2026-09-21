import path from "node:path";

import {
  CliCommands,
  ReportComparisons,
  type ReportFormat,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, removePath } from "../fsutil.js";
import { formatBytes, getLogger } from "../log.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { removeStagedOutputs, snapshotWritableFiles, writeTextFile } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import {
  gitPathFromPackageRelative,
  packageRelativeFromGitPath,
  resolveCommandPackageRoot,
} from "../project/package-root.js";
import { beefupDir, BeefupSnapshots, priorDir } from "../project/paths.js";
import type { StageReport } from "../report/types.js";
import { gitShowFile, isGitRepo, listGitTreePaths, resolveGitRef } from "../strategy/git.js";
import { runReport } from "./report.js";

/** Manifest and config files extracted from a historic git revision. */
const HistoricRootFiles = {
  PackageJson: "package.json",
  PnpmWorkspace: "pnpm-workspace.yaml",
  Npmrc: ".npmrc",
} as const;

export interface RewindOptions {
  projectRoot: string;
  packageRoot?: string;
  gitRef: string;
  format: ReportFormat;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain?: boolean;
  runner?: ProcessRunner;
}

/**
 * Extracts historic manifests from `gitRef` into `.beefup/prior`, then writes
 * an applied-context report (prior vs live).
 */
export async function runRewind(options: RewindOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const log = getLogger();
  const project = await detectProject(packageRoot.absolute);

  if (!(await isGitRepo(projectRoot))) {
    throw new BeefupError(`${CliCommands.Rewind} requires a git repository`);
  }

  const resolved = await log.timed(`resolving git ref ${options.gitRef}`, () =>
    resolveGitRef(options.gitRef, projectRoot)
  );
  log.info(`resolved ${options.gitRef} to ${resolved}`);
  const extractRoot = path.join(
    beefupDir(packageRoot.absolute),
    `${BeefupSnapshots.Prior}.extract`
  );
  await removePath(extractRoot);

  try {
    await log.timed(`extracting ${HistoricRootFiles.PackageJson}`, () =>
      extractHistoricFile(
        resolved,
        gitPathFromPackageRelative(
          packageRoot.relative,
          HistoricRootFiles.PackageJson
        ),
        HistoricRootFiles.PackageJson,
        projectRoot,
        extractRoot,
        true
      )
    );
    await log.timed(`extracting ${project.lockfileName}`, () =>
      extractHistoricFile(
        resolved,
        gitPathFromPackageRelative(packageRoot.relative, project.lockfileName),
        project.lockfileName,
        projectRoot,
        extractRoot,
        true
      )
    );
    await extractHistoricFile(
      resolved,
      gitPathFromPackageRelative(
        packageRoot.relative,
        HistoricRootFiles.PnpmWorkspace
      ),
      HistoricRootFiles.PnpmWorkspace,
      projectRoot,
      extractRoot,
      false
    );
    await extractHistoricFile(
      resolved,
      gitPathFromPackageRelative(packageRoot.relative, HistoricRootFiles.Npmrc),
      HistoricRootFiles.Npmrc,
      projectRoot,
      extractRoot,
      false
    );

    const treePaths = await log.timed("listing git tree", () =>
      listGitTreePaths(resolved, projectRoot)
    );
    for (const rel of treePaths) {
      const destRel = packageRelativeFromGitPath(packageRoot.relative, rel);
      if (
        destRel === undefined ||
        (destRel !== HistoricRootFiles.PackageJson &&
          !destRel.endsWith(`/${HistoricRootFiles.PackageJson}`))
      ) {
        continue;
      }
      if (await pathExists(path.join(extractRoot, destRel))) {
        continue;
      }
      await extractHistoricFile(
        resolved,
        rel.replaceAll("\\", "/"),
        destRel,
        projectRoot,
        extractRoot,
        false
      );
    }

    await log.timed("writing prior snapshot", () =>
      snapshotWritableFiles(
        extractRoot,
        priorDir(packageRoot.absolute),
        project.lockfileName
      )
    );
    await removeStagedOutputs(packageRoot.absolute);
  } finally {
    await removePath(extractRoot);
  }

  return log.timed("generating report", () =>
    runReport({
      projectRoot,
      packageRoot: packageRoot.relative,
      format: options.format,
      runner,
      comparison: ReportComparisons.Applied,
      noSafeChain: options.noSafeChain,
    })
  );
}

/**
 * Writes `ref:gitPath` into `extractRoot/destRel`. Required files throw when missing.
 */
async function extractHistoricFile(
  ref: string,
  gitPath: string,
  destRel: string,
  cwd: string,
  extractRoot: string,
  required: boolean
): Promise<void> {
  const contents = await gitShowFile(ref, gitPath, cwd);
  if (contents === undefined) {
    if (required) {
      throw new BeefupError(
        `${gitPath} was not found at ${ref}; cannot rewind`
      );
    }
    getLogger().debug(`${gitPath} not in ${ref}; skipping`);
    return;
  }
  await writeTextFile(path.join(extractRoot, destRel), contents);
  getLogger().debug(
    `wrote ${destRel} (${formatBytes(Buffer.byteLength(contents))})`
  );
}
