import type { StageStrategyName } from "../config/types.js";

/** Workspace root used while a staging strategy is active. */
export interface StageWorkspace {
  root: string;
}

/** Isolation strategy that prepares and cleans up a staging workspace. */
export interface StageStrategy {
  readonly name: StageStrategyName;
  /** Creates an isolated workspace ready for rewrite and lockfile regeneration. */
  prepare(): Promise<StageWorkspace>;
  /** Discards or restores the isolated workspace after staging finishes. */
  cleanup(): Promise<void>;
}
