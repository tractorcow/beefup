import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { pathExists, readJsonFile } from "../fsutil.js";
import type { PackageJson } from "./package-json.js";

export interface WorkspacePackage {
  /** POSIX-style relative path from project root; "." for root */
  relativeDir: string;
  packageJsonPath: string;
}

/**
 * Reads workspace glob patterns from package.json `workspaces` (array or object form).
 */
function workspacePatterns(pkg: PackageJson): string[] {
  if (!pkg.workspaces) {
    return [];
  }
  if (Array.isArray(pkg.workspaces)) {
    return pkg.workspaces;
  }
  return pkg.workspaces.packages ?? [];
}

/**
 * Lists the root package plus every workspace package under npm/pnpm workspace globs.
 */
export async function listWorkspacePackages(
  root: string
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [
    {
      relativeDir: ".",
      packageJsonPath: path.join(root, "package.json"),
    },
  ];
  const seen = new Set(["."]);

  const pkg = await readJsonFile<PackageJson>(path.join(root, "package.json"));
  let patterns = workspacePatterns(pkg);

  const workspaceYaml = path.join(root, "pnpm-workspace.yaml");
  if (await pathExists(workspaceYaml)) {
    const parsed = parseYaml(await readFile(workspaceYaml, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const listed = (parsed as Record<string, unknown>).packages;
      if (Array.isArray(listed)) {
        patterns = listed.filter((item): item is string => typeof item === "string");
      }
    }
  }

  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      continue;
    }
    const globPattern = path.posix.join(pattern.replace(/\/$/, ""), "package.json");
    for await (const match of glob(globPattern, { cwd: root })) {
      const relDir = path.posix.dirname(match.replaceAll("\\", "/"));
      if (seen.has(relDir)) {
        continue;
      }
      seen.add(relDir);
      packages.push({
        relativeDir: relDir,
        packageJsonPath: path.join(root, match),
      });
    }
  }

  return packages;
}

/**
 * Lists relative paths Beefup may rewrite: workspace package.json files, lockfile,
 * and optional pnpm-workspace.yaml / .npmrc when present.
 */
export async function listWritableRelativePaths(
  root: string,
  lockfileName: string
): Promise<string[]> {
  const rels: string[] = [];
  const workspaces = await listWorkspacePackages(root);
  for (const ws of workspaces) {
    rels.push(
      ws.relativeDir === "."
        ? "package.json"
        : path.posix.join(ws.relativeDir, "package.json")
    );
  }
  rels.push(lockfileName);
  if (await pathExists(path.join(root, "pnpm-workspace.yaml"))) {
    rels.push("pnpm-workspace.yaml");
  }
  if (await pathExists(path.join(root, ".npmrc"))) {
    rels.push(".npmrc");
  }
  return rels;
}
