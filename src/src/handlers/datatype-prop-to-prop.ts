/**
 * Stage 6: Convert DatatypeProperties to DTDL Properties on the appropriate interfaces.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLProperty } from "../dtdl-types.js";
import { xsdToDtdl } from "../datatype-map.js";
import { REC } from "../namespaces.js";

const SKIP_PROPERTIES = new Set([
  REC + "customProperties",
  REC + "customTags",
]);

export const DatatypePropertyToPropertyHandler: TripleHandler = {
  name: "DatatypePropertyToProperty",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    // Build reverse map: shape IRI → class IRI
    const shapeToClass = new Map<string, string>();
    for (const [classIri, shapeIris] of ctx.classProperties) {
      for (const shapeIri of shapeIris) {
        shapeToClass.set(shapeIri, classIri);
      }
    }

    // Build: property IRI → class IRIs
    const propertyToClasses = new Map<string, Set<string>>();
    for (const [shapeIri, shapeDef] of ctx.shapeDefinitions) {
      const classIri = shapeToClass.get(shapeIri);
      if (classIri) {
        const existing = propertyToClasses.get(shapeDef.path) ?? new Set();
        existing.add(classIri);
        propertyToClasses.set(shapeDef.path, existing);
      }
    }

    for (const [iri, propDef] of ctx.propertyDefinitions) {
      if (propDef.kind !== "datatype") continue;
      if (SKIP_PROPERTIES.has(iri)) continue;

      // Determine the DTDL schema type
      const shapes = ctx.shapesByPath.get(iri) ?? [];
      let schema: string = "string"; // default

      // Check shape datatype first, then rdfs:range
      if (shapes.length > 0 && shapes[0].datatype) {
        schema = xsdToDtdl(shapes[0].datatype) ?? "string";
      } else if (propDef.range) {
        const mapped = xsdToDtdl(propDef.range);
        if (mapped) {
          schema = mapped;
        } else {
          ctx.warnings.push(
            `Unknown datatype ${propDef.range} for ${propDef.localName} — defaulting to string`
          );
        }
      }

      const prop: DTDLProperty = {
        "@type": "Property",
        name: propDef.localName,
        schema,
      };

      if (Object.keys(propDef.labels).length > 0) {
        prop.displayName = propDef.labels;
      }

      if (Object.keys(propDef.comments).length > 0) {
        prop.description = propDef.comments;
      }

      // Place on the right interface(s)
      const targetClasses = propertyToClasses.get(iri);
      if (targetClasses && targetClasses.size > 0) {
        for (const classIri of targetClasses) {
          const iface = ctx.interfaces.get(classIri);
          if (iface) {
            iface.contents = iface.contents ?? [];
            iface.contents.push({ ...prop });
            ctx.stats.propertyCount++;
          }
        }
      } else if (propDef.domain) {
        const iface = ctx.interfaces.get(propDef.domain);
        if (iface) {
          iface.contents = iface.contents ?? [];
          iface.contents.push(prop);
          ctx.stats.propertyCount++;
        }
      }
      // Datatype properties without a class are silently dropped (e.g., standalone definitions)
    }
  },
};
