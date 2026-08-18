export interface StageWorkspace {
  root: string;
}

export interface StageStrategy {
  readonly name: "worktree" | "inplace";
  prepare(): Promise<StageWorkspace>;
  cleanup(): Promise<void>;
}
