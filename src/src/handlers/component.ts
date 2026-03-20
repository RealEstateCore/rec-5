/**
 * Stage 8: Detect value-type classes and convert their linking ObjectProperty
 * to a DTDL Component instead of a Relationship.
 *
 * Heuristic (all three must hold):
 *   1. The ObjectProperty has sh:maxCount 1 on at least one shape.
 *   2. The range class has NO outgoing ObjectProperties (no relationships
 *      leaving it — it's a pure "value type" or "struct" class).
 *   3. The range class is a leaf class (no subclasses in the hierarchy).
 *
 * If all conditions hold, the property becomes a Component whose schema
 * points to the range class's Interface.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLComponent } from "../dtdl-types.js";
import { iriToDtmi } from "../dtmi.js";

export const ComponentHandler: TripleHandler = {
  name: "Component",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    // Pre-compute: which classes have outgoing object properties?
    // A class has outgoing relationships if any ObjectProperty shape
    // references it as the owning class (via sh:property on the class's NodeShape).
    const classesWithOutgoingObjectProps = new Set<string>();

    for (const [classIri, shapeIris] of ctx.classProperties) {
      for (const shapeIri of shapeIris) {
        const shapeDef = ctx.shapeDefinitions.get(shapeIri);
        if (!shapeDef) continue;

        const propDef = ctx.propertyDefinitions.get(shapeDef.path);
        if (propDef?.kind === "object") {
          // This class declares an outgoing object property
          // But we care about the RANGE class, not the domain class.
          // We need to check if the range class itself has outgoing object properties.
        }
      }
    }

    // Build: for each class, does it have any outgoing object property shapes?
    // "Outgoing" means the class's NodeShape has sh:property pointing to a shape
    // whose sh:path is an ObjectProperty.
    const classHasOutgoingRels = new Map<string, boolean>();
    for (const [classIri, shapeIris] of ctx.classProperties) {
      let hasOutgoing = false;
      for (const shapeIri of shapeIris) {
        const shapeDef = ctx.shapeDefinitions.get(shapeIri);
        if (!shapeDef) continue;
        const propDef = ctx.propertyDefinitions.get(shapeDef.path);
        if (propDef?.kind === "object") {
          hasOutgoing = true;
          break;
        }
      }
      classHasOutgoingRels.set(classIri, hasOutgoing);
    }

    // Build: which classes have subclasses? (non-leaf detection)
    const classesWithSubclasses = new Set<string>();
    for (const [_classIri, parentIri] of ctx.classHierarchy) {
      if (parentIri) classesWithSubclasses.add(parentIri);
    }

    // Build reverse map: shape IRI → owning class IRIs
    const shapeToClasses = new Map<string, string[]>();
    for (const [classIri, shapeIris] of ctx.classProperties) {
      for (const shapeIri of shapeIris) {
        const existing = shapeToClasses.get(shapeIri) ?? [];
        existing.push(classIri);
        shapeToClasses.set(shapeIri, existing);
      }
    }

    // Scan all object properties for component candidates
    for (const [propIri, propDef] of ctx.propertyDefinitions) {
      if (propDef.kind !== "object") continue;

      // Condition 1: must have sh:maxCount 1 on at least one shape
      const shapes = ctx.shapesByPath.get(propIri) ?? [];
      const hasMaxOne = shapes.some((s) => s.maxCount === 1);
      if (!hasMaxOne) continue;

      // Determine the range class
      let rangeIri = propDef.range;
      if (!rangeIri) {
        for (const s of shapes) {
          if (s.targetClasses.length > 0) {
            rangeIri = s.targetClasses[0];
            break;
          }
        }
      }
      if (!rangeIri) continue;

      // Condition 2: range class must have NO outgoing object properties
      // (If it's not in classHasOutgoingRels, it has no shapes at all → qualifies)
      const rangeHasOutgoing = classHasOutgoingRels.get(rangeIri) ?? false;
      if (rangeHasOutgoing) continue;

      // Condition 3: range class must be a leaf (no subclasses)
      if (classesWithSubclasses.has(rangeIri)) continue;

      // Condition 4: range class must be in the class hierarchy (not external)
      // External classes (e.g., brick:Point) may appear as leaves only because
      // we don't have their full ontology loaded.
      if (!ctx.classHierarchy.has(rangeIri)) continue;

      // This property qualifies as a component!
      // Derive component name: hasArea → area, hasIdentifier → identifier
      let componentName = propDef.localName;
      if (componentName.startsWith("has")) {
        componentName =
          componentName.charAt(3).toLowerCase() + componentName.slice(4);
      }

      // Find owning classes via SHACL shapes
      const owningClasses = new Set<string>();
      for (const shape of shapes) {
        const classes = shapeToClasses.get(shape.iri) ?? [];
        for (const c of classes) owningClasses.add(c);
      }

      // Fallback to rdfs:domain
      if (owningClasses.size === 0 && propDef.domain) {
        owningClasses.add(propDef.domain);
      }

      for (const classIri of owningClasses) {
        const iface = ctx.interfaces.get(classIri);
        if (!iface) continue;

        const component: DTDLComponent = {
          "@type": "Component",
          name: componentName,
          schema: iriToDtmi(rangeIri),
        };

        // Build a clean displayName: if the label is just the raw property
        // name (e.g. "hasArea"), derive a user-friendly name from the
        // component name instead.  Otherwise use the ontology label as-is.
        const cleanDisplay: Record<string, string> = {};
        if (Object.keys(propDef.labels).length > 0) {
          for (const [lang, label] of Object.entries(propDef.labels)) {
            if (label === propDef.localName) {
              // Label is the raw property name — generate a friendly one
              cleanDisplay[lang] =
                componentName.charAt(0).toUpperCase() + componentName.slice(1);
            } else {
              cleanDisplay[lang] = label;
            }
          }
          component.displayName = cleanDisplay;
        }

        // Remove the relationship that was added in stage 5 for this property
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
