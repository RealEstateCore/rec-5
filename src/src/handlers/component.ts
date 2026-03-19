/**
 * Stage 8: Detect the "intermediate class" pattern and convert to DTDL Components.
 *
 * Pattern: An ObjectProperty whose range class primarily holds DatatypeProperties.
 * These become DTDL Components instead of Relationships.
 *
 * Known component patterns in REC:
 *   rec:hasArea → ArchitectureArea (on Architecture via sh:property)
 *   rec:hasCapacity → ArchitectureCapacity (on Architecture via sh:property)
 *   rec:hasIdentifier → Identifier (on multiple classes via sh:property)
 *
 * Domain is determined from SHACL sh:property linkage (not rdfs:domain).
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLComponent } from "../dtdl-types.js";
import { iriToDtmi } from "../dtmi.js";
import { REC } from "../namespaces.js";

/** Explicitly known component properties. */
const COMPONENT_PROPERTIES = new Set([
  REC + "hasArea",
  REC + "hasCapacity",
  REC + "hasIdentifier",
]);

export const ComponentHandler: TripleHandler = {
  name: "Component",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    // Build reverse map: shape IRI → class IRI
    const shapeToClass = new Map<string, string[]>();
    for (const [classIri, shapeIris] of ctx.classProperties) {
      for (const shapeIri of shapeIris) {
        const existing = shapeToClass.get(shapeIri) ?? [];
        existing.push(classIri);
        shapeToClass.set(shapeIri, existing);
      }
    }

    for (const propIri of COMPONENT_PROPERTIES) {
      const propDef = ctx.propertyDefinitions.get(propIri);
      if (!propDef || propDef.kind !== "object") continue;

      // Get the range — either from rdfs:range or from the shape's sh:class
      let rangeIri = propDef.range;
      if (!rangeIri) {
        const shapes = ctx.shapesByPath.get(propIri) ?? [];
        if (shapes.length > 0 && shapes[0].targetClasses.length > 0) {
          rangeIri = shapes[0].targetClasses[0];
        }
      }

      if (!rangeIri) {
        ctx.warnings.push(
          `Component property ${propDef.localName} has no range — skipped`
        );
        continue;
      }

      // Derive component name: hasArea → area, hasIdentifier → identifiers
      let componentName = propDef.localName;
      if (componentName.startsWith("has")) {
        componentName =
          componentName.charAt(3).toLowerCase() + componentName.slice(4);
      }
      if (componentName === "identifier") {
        componentName = "identifiers";
      }

      // Find owning classes via SHACL shapes that reference this property
      const shapes = ctx.shapesByPath.get(propIri) ?? [];
      const owningClasses = new Set<string>();

      for (const shape of shapes) {
        const classes = shapeToClass.get(shape.iri) ?? [];
        for (const c of classes) owningClasses.add(c);
      }

      // Fallback to rdfs:domain
      if (owningClasses.size === 0 && propDef.domain) {
        owningClasses.add(propDef.domain);
      }

      if (owningClasses.size === 0) {
        ctx.warnings.push(
          `Component property ${propDef.localName} has no owning class — skipped`
        );
        continue;
      }

      for (const classIri of owningClasses) {
        const iface = ctx.interfaces.get(classIri);
        if (!iface) continue;

        const component: DTDLComponent = {
          "@type": "Component",
          name: componentName,
          schema: iriToDtmi(rangeIri),
        };

        if (Object.keys(propDef.labels).length > 0) {
          component.displayName = propDef.labels;
        }

        // Remove the relationship that was already added for this property in stage 5
        if (iface.contents) {
          iface.contents = iface.contents.filter(
            (c) =>
              !(c["@type"] === "Relationship" && c.name === propDef.localName)
          );
        }

        iface.contents = iface.contents ?? [];
        iface.contents.push(component);
        ctx.stats.componentCount++;
      }
    }
  },
};
