/**
 * Stage 5: Convert ObjectProperties to DTDL Relationships on the appropriate interfaces.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLRelationship, LocalizedString } from "../dtdl-types.js";
import { iriToDtmi } from "../dtmi.js";
import { REC } from "../namespaces.js";

/** Properties to skip — root property and excluded properties. */
const SKIP_PROPERTIES = new Set([
  REC + "relationship",
  REC + "customProperties",
  REC + "customTags",
]);

export const ObjectPropertyToRelationshipHandler: TripleHandler = {
  name: "ObjectPropertyToRelationship",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    // Build a reverse map: shape IRI → class IRI (which class declares this shape)
    const shapeToClass = new Map<string, string>();
    for (const [classIri, shapeIris] of ctx.classProperties) {
      for (const shapeIri of shapeIris) {
        shapeToClass.set(shapeIri, classIri);
      }
    }

    // Build a map: property IRI → class IRI (via the shape that references this property)
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
      if (propDef.kind !== "object") continue;
      if (SKIP_PROPERTIES.has(iri)) continue;

      // Find the best shape for this property (for target class and cardinality)
      const shapes = ctx.shapesByPath.get(iri) ?? [];

      // Build the relationship
      const rel: DTDLRelationship = {
        "@type": "Relationship",
        name: propDef.localName,
      };

      if (Object.keys(propDef.labels).length > 0) {
        rel.displayName = propDef.labels;
      }

      // Use sh:class from shape as target
      if (shapes.length > 0) {
        const primaryShape = shapes[0];
        if (primaryShape.targetClasses.length === 1) {
          rel.target = iriToDtmi(primaryShape.targetClasses[0]);
        } else if (primaryShape.targetClasses.length > 1) {
          // Union range — use first, warn
          rel.target = iriToDtmi(primaryShape.targetClasses[0]);
          ctx.warnings.push(
            `Union range on ${propDef.localName} — using first class ${primaryShape.targetClasses[0]}`
          );
        }

        if (primaryShape.maxCount !== undefined) {
          rel.maxMultiplicity = primaryShape.maxCount;
        }
        if (
          primaryShape.minCount !== undefined &&
          ctx.profile.supportsMinMultiplicity
        ) {
          rel.minMultiplicity = primaryShape.minCount;
        }
      }

      // Build description/comment from OWL metadata
      const annotations: string[] = [];
      if (propDef.inverseOf) {
        annotations.push(`Inverse of: ${propDef.inverseOf.split("#").pop()}`);
      }
      if (propDef.characteristics.length > 0) {
        annotations.push(`OWL: ${propDef.characteristics.join(", ")}`);
      }

      if (Object.keys(propDef.comments).length > 0) {
        rel.description = propDef.comments;
      }
      if (annotations.length > 0) {
        rel.comment = annotations.join(". ");
      }

      // Place the relationship on the right interface(s)
      const targetClasses = propertyToClasses.get(iri);
      if (targetClasses && targetClasses.size > 0) {
        for (const classIri of targetClasses) {
          const iface = ctx.interfaces.get(classIri);
          if (iface) {
            iface.contents = iface.contents ?? [];
            iface.contents.push({ ...rel });
            ctx.stats.relationshipCount++;
          }
        }
      } else if (propDef.domain) {
        // Fallback: use rdfs:domain
        const iface = ctx.interfaces.get(propDef.domain);
        if (iface) {
          iface.contents = iface.contents ?? [];
          iface.contents.push(rel);
          ctx.stats.relationshipCount++;
        }
      } else {
        ctx.warnings.push(
          `Property ${propDef.localName} has no owning class — skipped`
        );
      }
    }
  },
};
