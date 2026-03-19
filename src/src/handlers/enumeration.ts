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

export const EnumerationHandler: TripleHandler = {
  name: "Enumeration",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    // For each interface, check if any Property contents have an sh:in constraint
    for (const [classIri, iface] of ctx.interfaces) {
      if (!iface.contents) continue;

      const shapeIris = ctx.classProperties.get(classIri) ?? [];

      for (const content of iface.contents) {
        if (content["@type"] !== "Property") continue;

        const prop = content as DTDLProperty;

        // Find the shape for this property that has sh:in
        for (const shapeIri of shapeIris) {
          const shapeDef = ctx.shapeDefinitions.get(shapeIri);
          if (!shapeDef) continue;

          // Match by property name — the shape's path local name should match
          const pathLocalName = shapeDef.path.includes("#")
            ? shapeDef.path.slice(shapeDef.path.lastIndexOf("#") + 1)
            : shapeDef.path.slice(shapeDef.path.lastIndexOf("/") + 1);

          if (pathLocalName !== prop.name) continue;
          if (!shapeDef.inValues || shapeDef.inValues.length === 0) continue;

          // Replace schema with Enum
          const enumValues: DTDLEnumValue[] = shapeDef.inValues.map((v) => ({
            name: v,
            enumValue: v,
          }));

          const enumSchema: DTDLEnum = {
            "@type": "Enum",
            valueSchema: "string",
            enumValues,
          };

          prop.schema = enumSchema;
          ctx.stats.enumCount++;
        }
      }

      // Also check for inline shapes (blank node shapes on the class)
      // These are shapes declared directly via sh:property [ sh:path ...; sh:in ... ]
      for (const shapeIri of shapeIris) {
        const shapeDef = ctx.shapeDefinitions.get(shapeIri);
        if (!shapeDef || !shapeDef.inValues || shapeDef.inValues.length === 0)
          continue;

        // Check if we already handled this property
        const pathLocalName = shapeDef.path.includes("#")
          ? shapeDef.path.slice(shapeDef.path.lastIndexOf("#") + 1)
          : shapeDef.path.slice(shapeDef.path.lastIndexOf("/") + 1);

        const alreadyHandled = iface.contents?.some(
          (c) => c["@type"] === "Property" && "name" in c && c.name === pathLocalName
        );

        if (alreadyHandled) continue;

        // This is an enum property declared only via shape — create the Property
        const enumValues: DTDLEnumValue[] = shapeDef.inValues.map((v) => ({
          name: v,
          enumValue: v,
        }));

        const enumSchema: DTDLEnum = {
          "@type": "Enum",
          valueSchema: "string",
          enumValues,
        };

        const propDef = ctx.propertyDefinitions.get(shapeDef.path);

        iface.contents = iface.contents ?? [];
        iface.contents.push({
          "@type": "Property",
          name: pathLocalName,
          schema: enumSchema,
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
