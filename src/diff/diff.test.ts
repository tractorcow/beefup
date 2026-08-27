import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveNpmLockfile } from "../lockfile/npm.js";
import { resolvePnpmLockfile } from "../lockfile/pnpm.js";
import {
  annotatePackageChanges,
  diffResolutions,
  formatUniqueVersions,
} from "./diff.js";
import { PackageChangeTypes } from "./types.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../__tests__/fixtures"
);

describe("diffResolutions", () => {
  it("reports npm lockfile changes without major/minor classification", async () => {
    const source = await resolveNpmLockfile(path.join(fixtures, "npm-old.json"));
    const target = await resolveNpmLockfile(path.join(fixtures, "npm-new.json"));
    const diff = diffResolutions(source, target);
    const express = diff.dependencies.find((item) => item.name === "express");
    assert.equal(express?.type, PackageChangeTypes.Changed);
    assert.deepEqual(express?.from.map((item) => item.version), ["4.17.0"]);
    assert.deepEqual(express?.to.map((item) => item.version), ["4.18.0"]);
    const react = diff.dependencies.find((item) => item.name === "react");
    assert.equal(react?.type, PackageChangeTypes.Added);
    const axios = diff.dependencies.find((item) => item.name === "axios");
    assert.equal(axios?.type, PackageChangeTypes.Changed);
  });

  it("diffs pnpm lockfiles the same way", async () => {
    const source = await resolvePnpmLockfile(path.join(fixtures, "pnpm-old.yaml"));
    const target = await resolvePnpmLockfile(path.join(fixtures, "pnpm-new.yaml"));
    const diff = diffResolutions(source, target);
    assert.ok(
      diff.dependencies.some(
        (item) =>
          item.name === "react" && item.type === PackageChangeTypes.Added
      )
    );
  });

  it("compares nested installs scope-for-scope and keeps multiple versions", () => {
    const diff = diffResolutions(
      {
        dependencies: [
          {
            name: "lodash",
            version: "4.0.0",
            path: "node_modules/lodash",
          },
          {
            name: "lodash",
            version: "3.10.1",
            path: "node_modules/foo/node_modules/lodash",
          },
        ],
        devDependencies: [],
      },
      {
        dependencies: [
          {
            name: "lodash",
            version: "4.1.0",
            path: "node_modules/lodash",
          },
          {
            name: "lodash",
            version: "3.10.1",
            path: "node_modules/foo/node_modules/lodash",
          },
        ],
        devDependencies: [],
      }
    );
    assert.equal(diff.dependencies.length, 1);
    const lodash = diff.dependencies[0];
    assert.equal(lodash?.name, "lodash");
    assert.equal(lodash?.type, PackageChangeTypes.Changed);
    assert.equal(lodash?.from.length, 2);
    assert.equal(lodash?.to.length, 2);
    assert.equal(
      formatUniqueVersions(lodash?.from ?? []),
      "3.10.1, 4.0.0"
    );
    assert.equal(formatUniqueVersions(lodash?.to ?? []), "3.10.1, 4.1.0");
  });

  it("does not treat unrelated scopes as the same install", () => {
    const diff = diffResolutions(
      {
        dependencies: [
          {
            name: "lodash",
            version: "4.0.0",
            path: "node_modules/lodash",
          },
        ],
        devDependencies: [],
      },
      {
        dependencies: [
          {
            name: "lodash",
            version: "3.10.1",
            path: "node_modules/foo/node_modules/lodash",
          },
        ],
        devDependencies: [],
      }
    );
    const lodash = diff.dependencies[0];
    assert.equal(lodash?.type, PackageChangeTypes.Changed);
    assert.equal(lodash?.from.length, 1);
    assert.equal(lodash?.to.length, 1);
    assert.notEqual(lodash?.from[0]?.path, lodash?.to[0]?.path);
  });

  it("omits Changed rows when only install paths move (unique versions unchanged)", () => {
    const diff = diffResolutions(
      {
        dependencies: [
          {
            name: "semver",
            version: "6.3.1",
            path: "node_modules/a/node_modules/semver",
          },
          {
            name: "semver",
            version: "6.3.1",
            path: "node_modules/b/node_modules/semver",
          },
        ],
        devDependencies: [],
      },
      {
        dependencies: [
          {
            name: "semver",
            version: "6.3.1",
            path: "node_modules/c/node_modules/semver",
          },
        ],
        devDependencies: [],
      }
    );
    assert.equal(
      diff.dependencies.find((item) => item.name === "semver"),
      undefined
    );
  });

  it("annotates direct and optional flags on package changes", () => {
    const before = {
      dependencies: [
        {
          name: "leftpad",
          version: "1.0.0",
          path: "node_modules/leftpad",
        },
        {
          name: "fsevents",
          version: "2.0.0",
          path: "node_modules/fsevents",
          optional: true,
        },
      ],
      devDependencies: [],
    };
    const after = {
      dependencies: [
        {
          name: "leftpad",
          version: "1.3.0",
          path: "node_modules/leftpad",
        },
        {
          name: "fsevents",
          version: "2.1.0",
          path: "node_modules/fsevents",
          optional: true,
        },
      ],
      devDependencies: [],
    };
    const annotated = annotatePackageChanges(diffResolutions(before, after), {
      directNames: new Set(["leftpad"]),
      optionalDeclaredNames: new Set(["fsevents"]),
      before,
      after,
    });
    const leftpad = annotated.dependencies.find((item) => item.name === "leftpad");
    const fsevents = annotated.dependencies.find(
      (item) => item.name === "fsevents"
    );
    assert.equal(leftpad?.direct, true);
    assert.equal(leftpad?.optional, false);
    assert.equal(fsevents?.direct, false);
    assert.equal(fsevents?.optional, true);
  });
});
