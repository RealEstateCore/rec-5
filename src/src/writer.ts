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
  const recDir = join(outputDir, "rec");
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
