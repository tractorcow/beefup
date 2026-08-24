import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { lockedVersionsFromNpm, parseNpmLockfile, resolveNpmLockfile } from "./npm.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../__tests__/fixtures"
);

describe("npm lockfile resolver", () => {
  it("extracts top-level and nested packages with install paths", async () => {
    const result = await resolveNpmLockfile(path.join(fixtures, "npm-basic.json"));
    assert.deepEqual(
      result.dependencies.find((pkg) => pkg.name === "express"),
      {
        name: "express",
        version: "4.18.0",
        path: "node_modules/express",
      }
    );
    assert.deepEqual(
      result.devDependencies.find((pkg) => pkg.name === "lodash"),
      {
        name: "lodash",
        version: "4.17.21",
        path: "node_modules/lodash",
      }
    );
    assert.deepEqual(
      result.dependencies.find((pkg) => pkg.name === "debug"),
      {
        name: "debug",
        version: "4.3.4",
        path: "node_modules/express/node_modules/debug",
      }
    );
  });

  it("maps direct locked versions for the root importer", () => {
    const lock = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { version: "1.0.0" },
          "node_modules/express": { version: "4.18.2" },
          "apps/web/node_modules/react": { version: "18.2.0" },
        },
      })
    );
    const root = lockedVersionsFromNpm(lock, ".");
    assert.equal(root.get("express"), "4.18.2");
    assert.equal(root.has("react"), false);
    const web = lockedVersionsFromNpm(lock, "apps/web");
    assert.equal(web.get("react"), "18.2.0");
  });
});
