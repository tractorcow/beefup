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
    assert.equal(web.get("express"), "4.18.2");
  });

  it("uses hoisted root installs for npm workspace importers", () => {
    const lock = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { version: "1.0.0" },
          "apps/customer": { version: "0.0.0" },
          "node_modules/react": { version: "19.3.0" },
          "node_modules/next": { version: "16.3.6" },
        },
      })
    );
    const customer = lockedVersionsFromNpm(lock, "apps/customer");
    assert.equal(customer.get("react"), "19.3.0");
    assert.equal(customer.get("next"), "16.3.6");
  });

  it("lets a nested install overlay a hoisted package", () => {
    const lock = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "node_modules/react": { version: "19.0.0" },
          "apps/web/node_modules/react": { version: "18.2.0" },
        },
      })
    );
    assert.equal(lockedVersionsFromNpm(lock, ".").get("react"), "19.0.0");
    assert.equal(lockedVersionsFromNpm(lock, "apps/web").get("react"), "18.2.0");
  });

  it("follows workspace link entries to the linked package version", () => {
    const lock = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "node_modules/@wc/typescript-config": {
            resolved: "packages/typescript-config",
            link: true,
          },
          "packages/typescript-config": { version: "0.0.0" },
        },
      })
    );
    const root = lockedVersionsFromNpm(lock, ".");
    assert.equal(root.get("@wc/typescript-config"), "0.0.0");
    const customer = lockedVersionsFromNpm(lock, "apps/customer");
    assert.equal(customer.get("@wc/typescript-config"), "0.0.0");
  });
});
