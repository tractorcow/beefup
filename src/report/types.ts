import type { ResolutionDiff } from "../diff/types.js";
import type { AlignmentFinding } from "../policy/alignment.js";
import type { OverrideFinding } from "../policy/overrides.js";
import type { RangeFinding } from "../policy/ranges.js";
import type { ClassifiedFindings } from "../security/classify.js";

export interface StageReport {
  mode: string;
  strategy: string;
  packageManager: string;
  diff: ResolutionDiff;
  ranges: RangeFinding[];
  overrides: OverrideFinding[];
  alignment: AlignmentFinding[];
  security: ClassifiedFindings;
  warnings: string[];
}
