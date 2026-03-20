/**
 * Stage 4: Create a DTDL Interface for each OWL class.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";
import type { DTDLInterface } from "../dtdl-types.js";
import { iriToDtmi } from "../dtmi.js";

export const ClassToInterfaceHandler: TripleHandler = {
  name: "ClassToInterface",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    for (const [classIri, parentIri] of ctx.classHierarchy) {
      const labels = ctx.classLabels.get(classIri);
      const comments = ctx.classComments.get(classIri);

      const iface: DTDLInterface = {
        "@id": iriToDtmi(classIri),
        "@type": "Interface",
        "@context": ctx.profile.contextUrl,
        contents: [],
      };

      if (labels && Object.keys(labels).length > 0) {
        iface.displayName = labels;
      }

      if (comments && Object.keys(comments).length > 0) {
        iface.description = comments;
      }

      // Only set extends if the parent is a known owl:Class that will also
      // become a DTDL Interface.  rec:Entity (the root) is not declared as
      // owl:Class in the ontology, so referencing it would create a dangling
      // extends that ADT cannot resolve.
      if (parentIri && ctx.classHierarchy.has(parentIri)) {
        iface.extends = iriToDtmi(parentIri);
      }

      ctx.interfaces.set(classIri, iface);
    }

    ctx.stats.interfaceCount = ctx.interfaces.size;
  },
};
