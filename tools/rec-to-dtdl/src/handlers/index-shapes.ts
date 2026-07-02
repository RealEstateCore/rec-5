/**
 * Stage 3: Index SHACL PropertyShapes and link them to NodeShapes (classes).
 *
 * Handles two patterns:
 *  1. Named PropertyShapes (rdf:type sh:PropertyShape) — the REC pattern
 *  2. Inline/anonymous shapes referenced via sh:property on a NodeShape — the Brick pattern
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext, ShapeDef } from "../context.js";
import type { Term } from "n3";
import {
  RDF_TYPE,
  SH_PROPERTY_SHAPE,
  SH_NODE_SHAPE,
  SH_PROPERTY,
  SH_PATH,
  SH_CLASS,
  SH_DATATYPE,
  SH_MAX_COUNT,
  SH_MIN_COUNT,
  SH_IN,
  SH_MESSAGE,
  SH_OR,
  OWL_CLASS,
} from "../namespaces.js";

export const IndexShapesHandler: TripleHandler = {
  name: "IndexShapes",

  handle(store: TripleStore, ctx: ConversionContext): void {
    // Index all explicitly typed PropertyShapes
    for (const quad of store.match(null, RDF_TYPE, SH_PROPERTY_SHAPE)) {
      indexShape(store, ctx, quad.subject);
    }

    // Link shapes to classes via sh:property on NodeShapes, and index
    // any inline shapes that weren't already indexed above.
    for (const [classIri] of ctx.classHierarchy) {
      const classQuads = store.store.getQuads(classIri, null, null, null);
      const subject = classQuads[0]?.subject;
      if (!subject) continue;

      const shapeRefs = store.objects(subject, SH_PROPERTY);
      if (shapeRefs.length === 0) continue;

      const shapeIris: string[] = [];
      for (const shapeRef of shapeRefs) {
        // If this shape wasn't already indexed (inline/anonymous), index it now
        if (!ctx.shapeDefinitions.has(shapeRef.value)) {
          indexShape(store, ctx, shapeRef);
        }
        shapeIris.push(shapeRef.value);
      }

      // Merge with any existing entries (e.g. from parent classes)
      const existing = ctx.classProperties.get(classIri) ?? [];
      ctx.classProperties.set(classIri, [...existing, ...shapeIris]);
    }
  },
};

/** Extract a ShapeDef from a shape node and register it in context. */
function indexShape(store: TripleStore, ctx: ConversionContext, subject: Term): void {
  const iri = subject.value;
  if (ctx.shapeDefinitions.has(iri)) return; // already indexed

  const pathObj = store.object(subject, SH_PATH);
  if (!pathObj) return;

  // Resolve target classes: direct sh:class or via sh:or list
  let targetClasses = store.objects(subject, SH_CLASS).map((t) => t.value);

  if (targetClasses.length === 0) {
    const orHead = store.object(subject, SH_OR);
    if (orHead) {
      targetClasses = resolveOrClasses(store, orHead);
    }
  }

  const datatype = store.object(subject, SH_DATATYPE)?.value;
  const maxCountObj = store.object(subject, SH_MAX_COUNT);
  const minCountObj = store.object(subject, SH_MIN_COUNT);
  const messageObj = store.object(subject, SH_MESSAGE);

  // Resolve sh:in list
  let inValues: string[] | undefined;
  const inObj = store.object(subject, SH_IN);
  if (inObj) {
    inValues = store.resolveList(inObj).map((t) => t.value);
  }

  const shapeDef: ShapeDef = {
    iri,
    path: pathObj.value,
    targetClasses,
    datatype,
    maxCount: maxCountObj ? parseInt(maxCountObj.value, 10) : undefined,
    minCount: minCountObj ? parseInt(minCountObj.value, 10) : undefined,
    inValues,
    message: messageObj?.value,
  };

  ctx.shapeDefinitions.set(iri, shapeDef);

  // Index by path for quick lookup
  const existing = ctx.shapesByPath.get(pathObj.value) ?? [];
  existing.push(shapeDef);
  ctx.shapesByPath.set(pathObj.value, existing);
}

/**
 * Resolve sh:or — an RDF list of constraint nodes, each potentially
 * containing sh:class. Returns the union of all sh:class values.
 */
function resolveOrClasses(store: TripleStore, listHead: Term): string[] {
  const classes: string[] = [];
  const nodes = store.resolveList(listHead);
  for (const node of nodes) {
    const cls = store.object(node, SH_CLASS);
    if (cls) classes.push(cls.value);
  }
  return classes;
}
