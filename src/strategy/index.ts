import { StageStrategies, type StageStrategyName } from "../config/types.js";
import { InPlaceStrategy } from "./inplace.js";
import type { StageStrategy } from "./types.js";
import { WorktreeStrategy } from "./worktree.js";

export type { StageStrategy, StageWorkspace } from "./types.js";

/**
 * Creates the isolation strategy used while staging an upgrade.
 */
export function createStageStrategy(
  name: StageStrategyName,
  projectRoot: string,
  lockfileName: string
): StageStrategy {
  if (name === StageStrategies.Inplace) {
    return new InPlaceStrategy(projectRoot, lockfileName);
  }
  return new WorktreeStrategy(projectRoot);
}
