import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FindingSeverities } from "../security/classify.js";
import {
  Ansi,
  ansiColorEnabled,
  ansiForSeverity,
  ColorEnv,
  paint,
} from "./ansi.js";

describe("ansiColorEnabled", () => {
  it("disables colour when NO_COLOR is set, even on a TTY", () => {
    const previous = process.env[ColorEnv.NoColor];
    process.env[ColorEnv.NoColor] = "1";
    try {
      assert.equal(ansiColorEnabled(true), false);
    } finally {
      if (previous === undefined) {
        delete process.env[ColorEnv.NoColor];
      } else {
        process.env[ColorEnv.NoColor] = previous;
      }
    }
  });

  it("enables colour with FORCE_COLOR when stdout is not a TTY", () => {
    const previousNo = process.env[ColorEnv.NoColor];
    const previousForce = process.env[ColorEnv.ForceColor];
    delete process.env[ColorEnv.NoColor];
    process.env[ColorEnv.ForceColor] = "1";
    try {
      assert.equal(ansiColorEnabled(false), true);
    } finally {
      if (previousNo === undefined) {
        delete process.env[ColorEnv.NoColor];
      } else {
        process.env[ColorEnv.NoColor] = previousNo;
      }
      if (previousForce === undefined) {
        delete process.env[ColorEnv.ForceColor];
      } else {
        process.env[ColorEnv.ForceColor] = previousForce;
      }
    }
  });
});

describe("paint", () => {
  it("wraps text when enabled and leaves it unchanged when disabled", () => {
    assert.equal(paint(Ansi.Red, "1.0.0", false), "1.0.0");
    assert.equal(paint(Ansi.Red, "1.0.0", true), `${Ansi.Red}1.0.0${Ansi.Reset}`);
    assert.equal(
      paint(ansiForSeverity(FindingSeverities.High), FindingSeverities.High, true),
      `${Ansi.Bold}${Ansi.Red}${FindingSeverities.High}${Ansi.Reset}`
    );
  });
});
