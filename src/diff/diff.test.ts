import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { diffResolutions } from "./diff.js";
import { PackageChangeType, VersionChangeType } from "./types.js";
import { resolveNpmLockfile } from "../lockfile/npm.js";
import { resolvePnpmLockfile } from "../lockfile/pnpm.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../__tests__/fixtures"
);

describe("diffResolutions", () => {
  it("classifies npm lockfile upgrades, adds, and major vs patch", async () => {
    const source = await resolveNpmLockfile(path.join(fixtures, "npm-old.json"));
    const target = await resolveNpmLockfile(path.join(fixtures, "npm-new.json"));
    const diff = diffResolutions(source, target);
    const express = diff.dependencies.find((item) => item.name === "express");
    assert.equal(express?.type, PackageChangeType.Upgraded);
    assert.equal(express?.versionChange, VersionChangeType.Minor);
    const react = diff.dependencies.find((item) => item.name === "react");
    assert.equal(react?.type, PackageChangeType.Added);
    const axios = diff.dependencies.find((item) => item.name === "axios");
    assert.equal(axios?.type, PackageChangeType.Upgraded);
    assert.equal(axios?.versionChange, VersionChangeType.Major);
  });

  it("diffs pnpm lockfiles the same way", async () => {
    const source = await resolvePnpmLockfile(path.join(fixtures, "pnpm-old.yaml"));
    const target = await resolvePnpmLockfile(path.join(fixtures, "pnpm-new.yaml"));
    const diff = diffResolutions(source, target);
    assert.ok(diff.dependencies.some((item) => item.name === "react" && item.type === PackageChangeType.Added));
  });
});
