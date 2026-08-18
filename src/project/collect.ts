import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { copyFileTo, pathExists, removePath } from "../fsutil.js";
import { stagedDir, beefupDir } from "./paths.js";
import { listWritableRelativePaths } from "./workspace.js";

export async function collectStagedOutputs(
  sourceRoot: string,
  projectRoot: string,
  lockfileName: string
): Promise<string> {
  const dest = stagedDir(projectRoot);
  const tmp = path.join(beefupDir(projectRoot), "staged.tmp");
  await removePath(tmp);
  await mkdir(tmp, { recursive: true });

  const rels = await listWritableRelativePaths(sourceRoot, lockfileName);
  for (const rel of rels) {
    const from = path.join(sourceRoot, rel);
    if (!(await pathExists(from))) {
      continue;
    }
    await copyFileTo(from, path.join(tmp, rel));
  }

  await removePath(dest);
  await mkdir(path.dirname(dest), { recursive: true });
  await rename(tmp, dest);
  return dest;
}
