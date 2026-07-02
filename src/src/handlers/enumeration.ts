/**
 * Stage 7: Convert SHACL sh:in constraints to DTDL inline Enum schemas.
 *
 * Finds Properties that have an sh:in constraint on their shape and
 * replaces the simple schema with an Enum schema.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLProperty, DTDLEnum, DTDLEnumValue } from "../dtdl-types.js";

function sanitizeEnumName(v: string): string {
  const local = v.includes("#")
    ? v.slice(v.lastIndexOf("#") + 1)
    : v.includes("/")
      ? v.slice(v.lastIndexOf("/") + 1)
      : v;
  let name = local.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[0-9]/.test(name)) name = "_" + name;
  name = name.replace(/_+$/, "");
  if (!name) return "x";
  if (name.length > 64) name = name.slice(0, 64).replace(/_+$/, "");
  return name;
}

function buildEnum(values: string[]): DTDLEnum {
  const seen = new Set<string>();
  const enumValues: DTDLEnumValue[] = [];
  for (const v of values) {
    let name = sanitizeEnumName(v);
    const base = name;
    let i = 2;
    while (seen.has(name)) {
      name = `${base}_${i++}`;
    }
    seen.add(name);
    enumValues.push({ name, enumValue: v });
  }
  return { "@type": "Enum", valueSchema: "string", enumValues };
}

export const EnumerationHandler: TripleHandler = {
  name: "Enumeration",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    for (const [classIri, iface] of ctx.interfaces) {
      if (!iface.contents) continue;

      const shapeIris = ctx.classProperties.get(classIri) ?? [];

      for (const content of iface.contents) {
        if (content["@type"] !== "Property") continue;

        const prop = content as DTDLProperty;

        for (const shapeIri of shapeIris) {
          const shapeDef = ctx.shapeDefinitions.get(shapeIri);
          if (!shapeDef) continue;

          const pathLocalName = shapeDef.path.includes("#")
            ? shapeDef.path.slice(shapeDef.path.lastIndexOf("#") + 1)
            : shapeDef.path.slice(shapeDef.path.lastIndexOf("/") + 1);

          if (pathLocalName !== prop.name) continue;
          if (!shapeDef.inValues || shapeDef.inValues.length === 0) continue;

          prop.schema = buildEnum(shapeDef.inValues);
          ctx.stats.enumCount++;
        }
      }

      for (const shapeIri of shapeIris) {
        const shapeDef = ctx.shapeDefinitions.get(shapeIri);
        if (!shapeDef || !shapeDef.inValues || shapeDef.inValues.length === 0)
          continue;

        const pathLocalName = shapeDef.path.includes("#")
          ? shapeDef.path.slice(shapeDef.path.lastIndexOf("#") + 1)
          : shapeDef.path.slice(shapeDef.path.lastIndexOf("/") + 1);

        const alreadyHandled = iface.contents?.some(
          (c) => c["@type"] === "Property" && "name" in c && c.name === pathLocalName
        );
        if (alreadyHandled) continue;

        // Remove any existing Relationship with the same name (Enum is more specific)
        iface.contents = (iface.contents ?? []).filter(
          (c) => !(c["@type"] === "Relationship" && "name" in c && c.name === pathLocalName)
        );

        const propDef = ctx.propertyDefinitions.get(shapeDef.path);

        iface.contents.push({
          "@type": "Property",
          name: pathLocalName,
          schema: buildEnum(shapeDef.inValues),
          ...(propDef?.labels && Object.keys(propDef.labels).length > 0
            ? { displayName: propDef.labels }
            : {}),
          ...(shapeDef.message ? { description: { en: shapeDef.message } } : {}),
        });

        ctx.stats.enumCount++;
        ctx.stats.propertyCount++;
      }
    }
  },
};
