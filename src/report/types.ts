import type { ReportComparison } from "../config/types.js";
import type { ResolutionDiff } from "../diff/types.js";
import type { AlignmentFinding } from "../policy/alignment.js";
import type { OverrideFinding } from "../policy/overrides.js";
import type { RangeFinding } from "../policy/ranges.js";
import type { ClassifiedFindings } from "../security/classify.js";

export interface StageReport {
  mode: string;
  strategy: string;
  packageManager: string;
  /** Whether this report compares a proposal (staged) or an applied upgrade (prior). */
  comparison?: ReportComparison;
  /** POSIX path from the project root to the directory that holds package.json. */
  packageRoot?: string;
  /** ISO timestamp when the report was generated. */
  generatedAt?: string;
  /** Beefup CLI version that produced the report. */
  beefupVersion?: string;
  diff: ResolutionDiff;
  ranges: RangeFinding[];
  overrides: OverrideFinding[];
  alignment: AlignmentFinding[];
  security: ClassifiedFindings;
  warnings: string[];
}
