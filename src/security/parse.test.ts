import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SecuritySources } from "./classify.js";
import { parseCveLiteJson } from "./cve-lite.js";
import { META_VULN_TITLE, parseNpmAuditJson } from "./npm-audit.js";
import {
  AdvisoryRefKinds,
  formatRefsMarkdown,
  refFromId,
  urlForCve,
  urlForGhsa,
  urlForOsv,
} from "./refs.js";

describe("parseNpmAuditJson", () => {
  it("extracts GHSA (and CVE) refs from advisory URLs instead of numeric npm ids", () => {
    const findings = parseNpmAuditJson(
      JSON.stringify({
        vulnerabilities: {
          lodash: {
            name: "lodash",
            severity: "high",
            via: [
              {
                source: 1113689,
                name: "lodash",
                title: "Prototype pollution",
                severity: "high",
                url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
                cve: ["CVE-2021-23337"],
              },
            ],
          },
        },
      })
    );
    assert.equal(findings[0]?.id, "GHSA-35jh-r3h4-6jhm");
    assert.equal(findings[0]?.refs.length, 2);
    assert.equal(findings[0]?.refs[0]?.kind, AdvisoryRefKinds.Ghsa);
    assert.equal(findings[0]?.refs[0]?.url, urlForGhsa("GHSA-35jh-r3h4-6jhm"));
    assert.equal(findings[0]?.refs[1]?.id, "CVE-2021-23337");
    assert.equal(findings[0]?.refs[1]?.url, urlForCve("CVE-2021-23337"));
    assert.equal(findings[0]?.packageName, "lodash");
    assert.equal(findings[0]?.title, "Prototype pollution");
    assert.equal(findings[0]?.sources[0], SecuritySources.NpmAudit);
  });

  it("keeps meta-vulns with viaPackages and a fixed title", () => {
    const findings = parseNpmAuditJson(
      JSON.stringify({
        vulnerabilities: {
          "my-app": {
            name: "my-app",
            severity: "high",
            via: ["lodash", "express"],
          },
        },
      })
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.title, META_VULN_TITLE);
    assert.deepEqual(findings[0]?.viaPackages, ["express", "lodash"]);
    assert.deepEqual(findings[0]?.refs, []);
    assert.equal(findings[0]?.id, "npm:my-app");
  });

  it("parses pnpm / npm v6 advisories maps", () => {
    const findings = parseNpmAuditJson(
      JSON.stringify({
        advisories: {
          "1123526": {
            id: 1123526,
            title: "vite: server.fs.deny bypass",
            module_name: "vite",
            severity: "high",
            github_advisory_id: "GHSA-fx2h-pf6j-xcff",
            url: "https://github.com/advisories/GHSA-fx2h-pf6j-xcff",
            findings: [{ version: "7.3.2" }],
          },
        },
      })
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.id, "GHSA-fx2h-pf6j-xcff");
    assert.equal(findings[0]?.packageName, "vite");
    assert.equal(findings[0]?.version, "7.3.2");
    assert.equal(findings[0]?.severity, "high");
    assert.equal(findings[0]?.title, "vite: server.fs.deny bypass");
    assert.equal(findings[0]?.sources[0], SecuritySources.NpmAudit);
    assert.equal(findings[0]?.refs[0]?.kind, AdvisoryRefKinds.Ghsa);
  });
});

describe("parseCveLiteJson", () => {
  it("collects ghsa, cve, and osvId refs", () => {
    const findings = parseCveLiteJson(
      JSON.stringify({
        findings: [
          {
            id: "GHSA-x234-xxxx-xxxx",
            package: "express",
            severity: "medium",
            version: "4.18.0",
            cve: "CVE-2024-1234",
            osvId: "OSV-2024-99",
          },
        ],
      })
    );
    assert.equal(findings[0]?.id, "GHSA-x234-xxxx-xxxx");
    assert.ok(findings[0]?.refs.some((ref) => ref.id === "CVE-2024-1234"));
    assert.ok(findings[0]?.refs.some((ref) => ref.id === "OSV-2024-99"));
    assert.equal(findings[0]?.severity, "moderate");
    assert.equal(findings[0]?.sources[0], "cve-lite");
  });

  it("expands nested vulnerabilities and cves from a cve-lite scan file", () => {
    const findings = parseCveLiteJson(
      JSON.stringify({
        findingCount: 1,
        findings: [
          {
            package: "vite",
            version: "7.3.2",
            severity: "high",
            cves: ["CVE-2026-53571"],
            vulnerabilities: [
              {
                id: "GHSA-fx2h-pf6j-xcff",
                aliases: ["CVE-2026-53571"],
                summary: "vite: server.fs.deny bypass",
                severity: "high",
              },
            ],
          },
        ],
      })
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.id, "GHSA-fx2h-pf6j-xcff");
    assert.equal(findings[0]?.packageName, "vite");
    assert.equal(findings[0]?.version, "7.3.2");
    assert.equal(findings[0]?.title, "vite: server.fs.deny bypass");
    assert.ok(findings[0]?.refs.some((ref) => ref.id === "CVE-2026-53571"));
    assert.equal(findings[0]?.sources[0], "cve-lite");
  });
});

describe("advisory refs", () => {
  it("formats markdown hyperlinks as a comma-separated list", () => {
    const refs = [
      refFromId("GHSA-35jh-r3h4-6jhm"),
      refFromId("CVE-2021-23337"),
    ].filter((ref): ref is NonNullable<typeof ref> => ref !== undefined);
    assert.equal(
      formatRefsMarkdown(refs),
      `[GHSA-35jh-r3h4-6jhm](${urlForGhsa("GHSA-35jh-r3h4-6jhm")}), [CVE-2021-23337](${urlForCve("CVE-2021-23337")})`
    );
  });

  it("path-encodes URL segments and rejects unsafe OSV ids", () => {
    assert.equal(
      urlForOsv("OSV-2024-99"),
      "https://osv.dev/vulnerability/OSV-2024-99"
    );
    assert.equal(
      urlForOsv("OSV-x/../y)"),
      "https://osv.dev/vulnerability/OSV-x%2F..%2Fy%29"
    );
    assert.deepEqual(refFromId("OSV-ok_id.1"), {
      id: "OSV-ok_id.1",
      kind: AdvisoryRefKinds.Osv,
      url: "https://osv.dev/vulnerability/OSV-ok_id.1",
    });
    assert.equal(refFromId("OSV-bad)(inject"), undefined);
    assert.equal(refFromId("OSV-bad/../x"), undefined);
    assert.equal(refFromId("not-a-ref](https://evil)"), undefined);
  });
});
