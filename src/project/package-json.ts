export interface PackageJson {
  name?: string;
  version?: string;
  packageManager?: string;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  beefup?: unknown;
  pnpm?: { overrides?: Record<string, unknown> };
}

export const DIRECT_DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

export type DirectDepField = (typeof DIRECT_DEP_FIELDS)[number];
