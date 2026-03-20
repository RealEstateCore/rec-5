import { describe, it, expect } from "vitest";
import { writeReport } from "./writer.js";
import { createContext } from "./context.js";
import { getProfile } from "./dtdl-profile.js";
import { REC } from "./namespaces.js";
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("writeReport", () => {
  it("writes a conversion report with warnings and skipped items", () => {
    const dir = mkdtempSync(join(tmpdir(), "rec-report-"));
    const ctx = createContext(getProfile("v2"), REC);

    ctx.stats.classCount = 5;
    ctx.stats.interfaceCount = 5;
    ctx.stats.relationshipCount = 3;
    ctx.stats.propertyCount = 10;
    ctx.stats.componentCount = 1;
    ctx.stats.enumCount = 2;

    ctx.warnings.push("Unknown datatype for prop1 — defaulting to string");
    ctx.skipped.push({
      iri: "http://example.org/orphanProp",
      reason: "ObjectProperty has no owning class",
    });

    writeReport(dir, ctx);

    const report = readFileSync(join(dir, "conversion-report.md"), "utf-8");
    expect(report).toContain("# Conversion Report");
    expect(report).toContain("Interfaces generated: 5");
    expect(report).toContain("Components: 1");
    expect(report).toContain("## Warnings");
    expect(report).toContain("Unknown datatype for prop1");
    expect(report).toContain("## Skipped (not converted)");
    expect(report).toContain("orphanProp");
    expect(report).toContain("ObjectProperty has no owning class");

    rmSync(dir, { recursive: true });
  });

  it("writes clean report when no warnings or skipped items", () => {
    const dir = mkdtempSync(join(tmpdir(), "rec-report-"));
    const ctx = createContext(getProfile("v2"), REC);

    writeReport(dir, ctx);

    const report = readFileSync(join(dir, "conversion-report.md"), "utf-8");
    expect(report).toContain("No warnings or skipped items.");
    expect(report).not.toContain("## Warnings");
    expect(report).not.toContain("## Skipped");

    rmSync(dir, { recursive: true });
  });
});
