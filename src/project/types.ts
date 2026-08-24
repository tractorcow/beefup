/** Supported Node package managers for lockfile detection and updates. */
export const PackageManagers = {
  Npm: "npm",
  Pnpm: "pnpm",
} as const;

/** Detected or configured package manager for a project. */
export type PackageManager =
  (typeof PackageManagers)[keyof typeof PackageManagers];

export interface DetectedProject {
  root: string;
  packageManager: PackageManager;
  lockfileName: string;
  lockfilePath: string;
}
