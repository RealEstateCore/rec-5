/**
 * Stage 3: Index SHACL PropertyShapes and link them to NodeShapes (classes).
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext, ShapeDef } from "../context.js";
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
  OWL_CLASS,
} from "../namespaces.js";

export const IndexShapesHandler: TripleHandler = {
  name: "IndexShapes",

  handle(store: TripleStore, ctx: ConversionContext): void {
    // Index all PropertyShapes
    for (const quad of store.match(null, RDF_TYPE, SH_PROPERTY_SHAPE)) {
      const shapeIri = quad.subject.value;
      const subject = quad.subject;

      const pathObj = store.object(subject, SH_PATH);
      if (!pathObj) continue;

      const targetClasses = store
        .objects(subject, SH_CLASS)
        .map((t) => t.value);
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
        iri: shapeIri,
        path: pathObj.value,
        targetClasses,
        datatype,
        maxCount: maxCountObj ? parseInt(maxCountObj.value, 10) : undefined,
        minCount: minCountObj ? parseInt(minCountObj.value, 10) : undefined,
        inValues,
        message: messageObj?.value,
      };

      ctx.shapeDefinitions.set(shapeIri, shapeDef);

      // Index by path for quick lookup
      const existing = ctx.shapesByPath.get(pathObj.value) ?? [];
      existing.push(shapeDef);
      ctx.shapesByPath.set(pathObj.value, existing);
    }

    // Link shapes to classes via sh:property on NodeShapes
    // NodeShapes are also owl:Class in REC
    for (const [classIri] of ctx.classHierarchy) {
      const classQuads = store.store.getQuads(classIri, null, null, null);
      const subject = classQuads[0]?.subject;
      if (!subject) continue;

      const shapeRefs = store.objects(subject, SH_PROPERTY);
      if (shapeRefs.length > 0) {
        ctx.classProperties.set(
          classIri,
          shapeRefs.map((s) => s.value)
        );
      }
    }
  },
};
