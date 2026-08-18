import type { StageStrategyName } from "../config/types.js";
import { InPlaceStrategy } from "./inplace.js";
import { WorktreeStrategy } from "./worktree.js";
import type { StageStrategy } from "./types.js";

export type { StageStrategy, StageWorkspace } from "./types.js";

export function createStageStrategy(
  name: StageStrategyName,
  projectRoot: string,
  lockfileName: string
): StageStrategy {
  if (name === "inplace") {
    return new InPlaceStrategy(projectRoot, lockfileName);
  }
  return new WorktreeStrategy(projectRoot);
}
