import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BEEFUP_DIR } from "../project/paths.js";
import { hasNonBeefupWorkingTreeChanges } from "./git.js";

describe("hasNonBeefupWorkingTreeChanges", () => {
  it("treats an empty status as clean", () => {
    assert.equal(hasNonBeefupWorkingTreeChanges(""), false);
  });

  it("ignores untracked .beefup files and the collapsed directory", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/staged/package.json`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `?? ${BEEFUP_DIR}/\n?? ${BEEFUP_DIR}/report/REPORT.md`
      ),
      false
    );
  });

  it("detects untracked or modified files outside .beefup", () => {
    assert.equal(hasNonBeefupWorkingTreeChanges("?? dirty.txt"), true);
    assert.equal(hasNonBeefupWorkingTreeChanges(" M package.json"), true);
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? ${BEEFUP_DIR}/\n?? dirty.txt`),
      true
    );
  });

  it("ignores quoted .beefup paths and rename-only moves inside .beefup", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(`?? "${BEEFUP_DIR}/staged/package.json"`),
      false
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  ${BEEFUP_DIR}/old.txt -> ${BEEFUP_DIR}/new.txt`
      ),
      false
    );
  });

  it("treats a rename that leaves or enters .beefup as dirty", () => {
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  package.json -> ${BEEFUP_DIR}/package.json`
      ),
      true
    );
    assert.equal(
      hasNonBeefupWorkingTreeChanges(
        `R  ${BEEFUP_DIR}/package.json -> package.json`
      ),
      true
    );
  });
});
