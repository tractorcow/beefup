import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_CONFIG } from "../config/types.js";
import { PackageManagers } from "../project/types.js";
import { findAlignmentIssues } from "./alignment.js";

describe("findAlignmentIssues", () => {
  it("requires grouped packages to share the source exact version", () => {
    const findings = findAlignmentIssues(
      {
        ...DEFAULT_CONFIG,
        alignedGroups: [
          {
            name: "strapi",
            source: "@strapi/strapi",
            packages: ["@strapi/admin", "@strapi/strapi"],
          },
        ],
      },
      {
        dependencies: {
          "@strapi/strapi": "5.51.1",
          "@strapi/admin": "5.50.0",
        },
      },
      PackageManagers.Npm,
      {
        packages: {
          "node_modules/@strapi/strapi": { version: "5.51.1" },
          "node_modules/@strapi/admin": { version: "5.50.0" },
        },
      }
    );
    assert.ok(findings.some((item) => item.message.includes("@strapi/admin")));
  });
});
