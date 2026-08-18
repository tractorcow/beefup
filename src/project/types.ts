export type PackageManager = "npm" | "pnpm";

export interface DetectedProject {
  root: string;
  packageManager: PackageManager;
  lockfileName: string;
  lockfilePath: string;
}
