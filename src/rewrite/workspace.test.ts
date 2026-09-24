import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { readJsonFile, writeJsonFile } from "../fsutil.js";
import type { PackageJson } from "../project/package-json.js";
import { LockfileNames, PackageManagers } from "../project/types.js";
import { lockfilePathFor, repinWorkspace } from "./workspace.js";

describe("repinWorkspace", () => {
  it("re-pins npm workspace packages from hoisted lockfile installs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "beefup-repin-npm-"));
    try {
      await writeJsonFile(path.join(dir, "package.json"), {
        name: "root",
        workspaces: ["apps/*"],
        devDependencies: { "@wc/config": "^0.0.0" },
      });
      await writeJsonFile(path.join(dir, "apps/web/package.json"), {
        name: "web",
        dependencies: { react: "^18.2.0" },
      });
      await writeFile(
        path.join(dir, LockfileNames.Npm),
        `${JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { version: "1.0.0" },
            "apps/web": { version: "1.0.0" },
            "node_modules/react": { version: "18.3.1" },
            "node_modules/@wc/config": {
              resolved: "packages/config",
              link: true,
            },
            "packages/config": { name: "@wc/config", version: "0.0.0" },
          },
        })}\n`
      );

      await repinWorkspace(
        dir,
        lockfilePathFor(dir, LockfileNames.Npm),
        PackageManagers.Npm
      );

      const root = await readJsonFile<PackageJson>(path.join(dir, "package.json"));
      const web = await readJsonFile<PackageJson>(
        path.join(dir, "apps/web/package.json")
      );
      assert.equal(root.devDependencies?.["@wc/config"], "0.0.0");
      assert.equal(web.dependencies?.react, "18.3.1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
