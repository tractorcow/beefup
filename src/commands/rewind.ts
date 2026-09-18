import path from "node:path";

import {
  CliCommands,
  ReportComparisons,
  type ReportFormat,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { pathExists, removePath } from "../fsutil.js";
import { defaultProcessRunner, type ProcessRunner } from "../pm/runner.js";
import { snapshotWritableFiles, writeTextFile } from "../project/collect.js";
import { detectProject } from "../project/detect.js";
import {
  gitPathFromPackageRelative,
  packageRelativeFromGitPath,
  resolveCommandPackageRoot,
} from "../project/package-root.js";
import { beefupDir, BeefupSnapshots, priorDir } from "../project/paths.js";
import { listWritableRelativePaths } from "../project/workspace.js";
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
  runner?: ProcessRunner;
}

/**
 * Extracts historic manifests from `gitRef` into `.beefup/prior`, then writes
 * an applied-context report (prior vs live).
 */
export async function runRewind(options: RewindOptions): Promise<StageReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const packageRoot = await resolveCommandPackageRoot(
    projectRoot,
    options.packageRoot
  );
  const runner = options.runner ?? defaultProcessRunner;
  const project = await detectProject(packageRoot.absolute);

  if (!(await isGitRepo(projectRoot))) {
    throw new BeefupError(`${CliCommands.Rewind} requires a git repository`);
  }

  const resolved = await resolveGitRef(options.gitRef, projectRoot);
  const extractRoot = path.join(
    beefupDir(projectRoot),
    `${BeefupSnapshots.Prior}.extract`
  );
  await removePath(extractRoot);

  try {
    await extractHistoricFile(
      resolved,
      gitPathFromPackageRelative(
        packageRoot.relative,
        HistoricRootFiles.PackageJson
      ),
      HistoricRootFiles.PackageJson,
      projectRoot,
      extractRoot,
      true
    );
    await extractHistoricFile(
      resolved,
      gitPathFromPackageRelative(packageRoot.relative, project.lockfileName),
      project.lockfileName,
      projectRoot,
      extractRoot,
      true
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

    const treePaths = await listGitTreePaths(resolved, projectRoot);
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

    const rels = await listWritableRelativePaths(
      extractRoot,
      project.lockfileName
    );
    for (const rel of rels) {
      const dest = path.join(extractRoot, rel);
      if (await pathExists(dest)) {
        continue;
      }
      await extractHistoricFile(
        resolved,
        gitPathFromPackageRelative(packageRoot.relative, rel),
        rel,
        projectRoot,
        extractRoot,
        false
      );
    }

    await snapshotWritableFiles(
      extractRoot,
      priorDir(projectRoot),
      project.lockfileName
    );
  } finally {
    await removePath(extractRoot);
  }

  return runReport({
    projectRoot,
    packageRoot: packageRoot.relative,
    format: options.format,
    runner,
    comparison: ReportComparisons.Applied,
  });
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
    return;
  }
  await writeTextFile(path.join(extractRoot, destRel), contents);
}
