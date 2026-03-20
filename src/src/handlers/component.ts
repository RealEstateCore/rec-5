/**
 * Stage 8: Detect value-type classes and convert their linking ObjectProperty
 * to a DTDL Component instead of a Relationship.
 *
 * Heuristic (both must hold):
 *   1. The ObjectProperty has sh:maxCount 1 on at least one shape.
 *   2. The range class has NO outgoing ObjectProperties (no relationships
 *      leaving it — it's a pure "value type" or "struct" class).
 *
 * Component detection is configurable via the converter config:
 *   - detect: enable/disable heuristic detection (default: true)
 *   - include: property IRIs or local names to always treat as components
 *   - exclude: property IRIs or local names to never treat as components
 *
 * Component name = the object property's local name as-is (faithful to ontology).
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLComponent } from "../dtdl-types.js";
import { iriToDtmi } from "../dtmi.js";

export const ComponentHandler: TripleHandler = {
  name: "Component",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    const componentConfig = ctx.config.components ?? { detect: true };
    const includeSet = new Set(componentConfig.include ?? []);
    const excludeSet = new Set(componentConfig.exclude ?? []);
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

      const propLocalName = propDef.localName;

      // Check explicit exclude — never make this a component
      if (excludeSet.has(propIri) || excludeSet.has(propLocalName)) continue;

      // Check explicit include — always make this a component (skip heuristic)
      const forceInclude =
        includeSet.has(propIri) || includeSet.has(propLocalName);

      if (!forceInclude) {
        // Heuristic detection must be enabled
        if (componentConfig.detect === false) continue;

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
        const rangeHasOutgoing = classHasOutgoingRels.get(rangeIri) ?? false;
        if (rangeHasOutgoing) continue;

        // Condition 3: range class must be in the class hierarchy (not external)
        if (!ctx.classHierarchy.has(rangeIri)) continue;
      }

      // Determine range for schema reference
      const shapes = ctx.shapesByPath.get(propIri) ?? [];
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

      // Component name = property localName as-is (faithful to ontology)
      const componentName = propLocalName;

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

        if (Object.keys(propDef.labels).length > 0) {
          component.displayName = propDef.labels;
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
