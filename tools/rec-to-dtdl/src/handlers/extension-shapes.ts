/**
 * Stage 9: Handle SHACL extension shapes that target existing classes via sh:targetClass.
 *
 * This supports the REC 5 extension pattern described in issue #1:
 * External ontologies can declare new properties on REC classes using
 * sh:targetClass rather than making the class itself a sh:NodeShape.
 *
 * Example extension pattern:
 *   ex:SpaceExtensionShape a sh:NodeShape ;
 *     sh:targetClass rec:Space ;
 *     sh:property ex:customEnergyRatingShape .
 *
 *   ex:customEnergyRating a owl:DatatypeProperty ;
 *     rdfs:label "energy rating"@en ;
 *     rdfs:range xsd:string .
 *
 *   ex:customEnergyRatingShape a sh:PropertyShape ;
 *     sh:path ex:customEnergyRating ;
 *     sh:datatype xsd:string ;
 *     sh:maxCount 1 .
 *
 * This handler finds NodeShapes with sh:targetClass and adds their
 * properties to the targeted DTDL interface.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLProperty, DTDLRelationship } from "../dtdl-types.js";
import { iriToDtmi, localName } from "../dtmi.js";
import { xsdToDtdl } from "../datatype-map.js";
import {
  RDF_TYPE,
  SH_NODE_SHAPE,
  SH_PROPERTY,
  SH,
} from "../namespaces.js";
import { DataFactory } from "n3";

const { namedNode } = DataFactory;
const SH_TARGET_CLASS = namedNode(SH + "targetClass");

export const ExtensionShapesHandler: TripleHandler = {
  name: "ExtensionShapes",

  handle(store: TripleStore, ctx: ConversionContext): void {
    // Find all NodeShapes that have sh:targetClass
    for (const quad of store.match(null, SH_TARGET_CLASS, null)) {
      const shapeNode = quad.subject;
      const targetClassIri = quad.object.value;

      // Find the interface for this target class
      const iface = ctx.interfaces.get(targetClassIri);
      if (!iface) {
        ctx.warnings.push(
          `Extension shape ${shapeNode.value} targets unknown class ${targetClassIri} — skipped`
        );
        ctx.skipped.push({
          iri: shapeNode.value,
          reason: `Extension shape targets unknown class ${targetClassIri}`,
        });
        continue;
      }

      // Get all sh:property references from this extension shape
      const propertyRefs = store.objects(shapeNode, SH_PROPERTY);

      for (const propRef of propertyRefs) {
        const shapeDef = ctx.shapeDefinitions.get(propRef.value);
        if (!shapeDef) {
          // It might be an inline blank node shape — try to find it by IRI
          continue;
        }

        const propDef = ctx.propertyDefinitions.get(shapeDef.path);
        const propLocalName = localName(shapeDef.path);

        // Skip if this property is already on the interface
        const alreadyExists = iface.contents?.some(
          (c) => "name" in c && c.name === propLocalName
        );
        if (alreadyExists) continue;

        iface.contents = iface.contents ?? [];

        if (propDef?.kind === "object" || shapeDef.targetClasses.length > 0) {
          // Object property → Relationship
          const rel: DTDLRelationship = {
            "@type": "Relationship",
            name: propLocalName,
          };

          if (propDef?.labels && Object.keys(propDef.labels).length > 0) {
            rel.displayName = propDef.labels;
          }

          if (shapeDef.targetClasses.length > 0) {
            rel.target = iriToDtmi(shapeDef.targetClasses[0]);
          }

          if (shapeDef.maxCount !== undefined) {
            rel.maxMultiplicity = shapeDef.maxCount;
          }

          iface.contents.push(rel);
          ctx.stats.relationshipCount++;
        } else {
          // Datatype property → Property
          let schema = "string";
          if (shapeDef.datatype) {
            schema = xsdToDtdl(shapeDef.datatype) ?? "string";
          } else if (propDef?.range) {
            schema = xsdToDtdl(propDef.range) ?? "string";
          }

          const prop: DTDLProperty = {
            "@type": "Property",
            name: propLocalName,
            schema,
          };

          if (propDef?.labels && Object.keys(propDef.labels).length > 0) {
            prop.displayName = propDef.labels;
          }

          iface.contents.push(prop);
          ctx.stats.propertyCount++;
        }
      }
    }
  },
};
