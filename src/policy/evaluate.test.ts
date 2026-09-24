import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AlignmentActions } from "../config/types.js";
import { BeefupError } from "../errors.js";
import { assertPolicy } from "./evaluate.js";

describe("assertPolicy", () => {
  it("does not fail on warn-severity override pins", () => {
    assert.doesNotThrow(() =>
      assertPolicy({
        ranges: [],
        overrides: [
          {
            override: "ajv",
            message: "pin ajv@6.15.0 is below @hookform/resolvers → ajv@^8.12.0",
            severity: AlignmentActions.Warn,
          },
        ],
        alignment: [],
        warnings: [],
      })
    );
  });

  it("fails on error-severity override findings", () => {
    assert.throws(
      () =>
        assertPolicy({
          ranges: [],
          overrides: [
            {
              override: "ws",
              message: "pin must not use floating tag",
              severity: AlignmentActions.Error,
            },
          ],
          alignment: [],
          warnings: [],
        }),
      (error: unknown) => {
        assert.ok(error instanceof BeefupError);
        assert.match(error.message, /policy failed/);
        return true;
      }
    );
  });
});
