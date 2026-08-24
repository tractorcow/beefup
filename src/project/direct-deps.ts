import { readJsonFile } from "../fsutil.js";
import { DIRECT_DEP_FIELDS, type PackageJson } from "./package-json.js";
import { listWorkspacePackages } from "./workspace.js";

/**
 * Collects direct and optionalDependency package names across the workspace.
 */
export async function collectDirectDependencyNames(projectRoot: string): Promise<{
  directNames: Set<string>;
  optionalDeclaredNames: Set<string>;
}> {
  const directNames = new Set<string>();
  const optionalDeclaredNames = new Set<string>();
  const workspaces = await listWorkspacePackages(projectRoot);
  for (const ws of workspaces) {
    const pkg = await readJsonFile<PackageJson>(ws.packageJsonPath);
    for (const field of DIRECT_DEP_FIELDS) {
      const bucket = pkg[field];
      if (!bucket) {
        continue;
      }
      for (const name of Object.keys(bucket)) {
        directNames.add(name);
        if (field === "optionalDependencies") {
          optionalDeclaredNames.add(name);
        }
      }
    }
  }
  return { directNames, optionalDeclaredNames };
}
