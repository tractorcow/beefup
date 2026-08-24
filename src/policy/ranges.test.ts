import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AlignmentActions,
  BannedRangeTags,
  DEFAULT_CONFIG,
} from "../config/types.js";
import { findRangeIssues } from "./ranges.js";

describe("findRangeIssues", () => {
  it("errors on banned latest and * after re-pin", () => {
    const findings = findRangeIssues(
      {
        dependencies: {
          foo: BannedRangeTags.Latest,
          bar: BannedRangeTags.Any,
        },
      },
      DEFAULT_CONFIG,
      "package.json"
    );
    assert.equal(
      findings.filter((item) => item.severity === AlignmentActions.Error).length,
      2
    );
  });

  it("warns on leftover loose ranges when preferExact is set", () => {
    const findings = findRangeIssues(
      { dependencies: { foo: "^1.2.3" } },
      DEFAULT_CONFIG,
      "package.json"
    );
    assert.equal(findings[0]?.severity, AlignmentActions.Warn);
  });
});
