/**
 * Writes DTDL Interfaces to a folder structure.
 *
 * Folder nesting rule: classes whose parent is a "major" REC class
 * get files at the top level. Deeper subclasses are grouped into
 * folders named after their nearest major ancestor.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { DTDLInterface } from "./dtdl-types.js";
import type { ConversionContext } from "./context.js";
import { localName } from "./dtmi.js";
import { REC } from "./namespaces.js";

const MAJOR_CLASSES = new Set([
  REC + "Entity",
  REC + "Space",
  REC + "Asset",
  REC + "Agent",
  REC + "Event",
  REC + "Collection",
  REC + "BuildingElement",
  REC + "Information",
]);

export function writeOutput(outputDir: string, ctx: ConversionContext): void {
  const recDir = join(outputDir, "models");
  mkdirSync(recDir, { recursive: true });

  // Build a map of class IRI → nearest major ancestor for folder grouping
  const classToFolder = new Map<string, string | null>();

  for (const [classIri] of ctx.interfaces) {
    const folder = findNearestMajorAncestor(classIri, ctx);
    classToFolder.set(classIri, folder);
  }

  for (const [classIri, iface] of ctx.interfaces) {
    const name = localName(classIri);
    const folder = classToFolder.get(classIri);
    const isMajor = MAJOR_CLASSES.has(classIri);

    let filePath: string;

    if (isMajor) {
      // Major classes go at the top level
      filePath = join(recDir, `${name}.json`);
    } else if (folder) {
      // Group under the nearest major ancestor
      const folderName = localName(folder);
      const subDir = join(recDir, folderName);
      mkdirSync(subDir, { recursive: true });
      filePath = join(subDir, `${name}.json`);
    } else {
      // No major ancestor found — put at top level
      filePath = join(recDir, `${name}.json`);
    }

    // Clean up: remove empty contents arrays
    const output = { ...iface };
    if (output.contents && output.contents.length === 0) {
      delete output.contents;
    }

    writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  }
}

export function writeReport(outputDir: string, ctx: ConversionContext): void {
  const lines: string[] = [];
  lines.push("# Conversion Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Classes found: ${ctx.stats.classCount}`);
  lines.push(`- Interfaces generated: ${ctx.stats.interfaceCount}`);
  lines.push(`- Relationships: ${ctx.stats.relationshipCount}`);
  lines.push(`- Properties: ${ctx.stats.propertyCount}`);
  lines.push(`- Components: ${ctx.stats.componentCount}`);
  lines.push(`- Enumerations: ${ctx.stats.enumCount}`);
  if (ctx.stats.dedupCount > 0) {
    lines.push(`- Inherited duplicates removed: ${ctx.stats.dedupCount}`);
  }
  lines.push("");

  // Warnings
  if (ctx.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ctx.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // Skipped / unconverted items
  if (ctx.skipped.length > 0) {
    lines.push("## Skipped (not converted)");
    lines.push("");
    for (const item of ctx.skipped) {
      lines.push(`- \`${item.iri}\`: ${item.reason}`);
    }
    lines.push("");
  }

  // Semantic notes (OWL characteristics lost in translation)
  if (ctx.semanticNotes.length > 0) {
    lines.push("## Semantic Properties Lost in Translation");
    lines.push("");
    for (const note of ctx.semanticNotes) {
      lines.push(`- **${note.property}**: ${note.note}`);
    }
    lines.push("");
  }

  if (ctx.warnings.length === 0 && ctx.skipped.length === 0 && ctx.semanticNotes.length === 0) {
    lines.push("No warnings or skipped items.");
    lines.push("");
  }

  const reportPath = join(outputDir, "conversion-report.md");
  writeFileSync(reportPath, lines.join("\n"), "utf-8");
}

function findNearestMajorAncestor(
  classIri: string,
  ctx: ConversionContext
): string | null {
  if (MAJOR_CLASSES.has(classIri)) return null; // It IS a major class

  let current = ctx.classHierarchy.get(classIri) ?? null;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break; // prevent cycles
    visited.add(current);

    if (MAJOR_CLASSES.has(current)) return current;
    current = ctx.classHierarchy.get(current) ?? null;
  }

  return null;
}
