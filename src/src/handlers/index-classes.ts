/**
 * Stage 1: Index all OWL classes — build class hierarchy, labels, comments.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import {
  RDF_TYPE,
  OWL_CLASS,
  RDFS_SUBCLASS_OF,
  RDFS_LABEL,
  RDFS_COMMENT,
} from "../namespaces.js";

export const IndexClassesHandler: TripleHandler = {
  name: "IndexClasses",

  handle(store: TripleStore, ctx: ConversionContext): void {
    const classQuads = store.match(null, RDF_TYPE, OWL_CLASS);

    for (const quad of classQuads) {
      const classIri = quad.subject.value;

      // Skip blank nodes
      if (quad.subject.termType !== "NamedNode") continue;

      // Get parent class
      const parentObj = store.object(quad.subject, RDFS_SUBCLASS_OF);
      const parentIri = parentObj?.value ?? null;

      ctx.classHierarchy.set(classIri, parentIri);

      // Labels
      const labels = store.labels(quad.subject, RDFS_LABEL);
      if (Object.keys(labels).length > 0) {
        ctx.classLabels.set(classIri, labels);
      }

      // Comments
      const comments = store.labels(quad.subject, RDFS_COMMENT);
      if (Object.keys(comments).length > 0) {
        ctx.classComments.set(classIri, comments);
      }
    }

    ctx.stats.classCount = ctx.classHierarchy.size;
  },
};
