/**
 * Stage 10: Remove contents that duplicate a name already defined
 * in a parent interface.
 *
 * Brick uses SHACL property refinement in subclasses (re-declaring
 * sh:property on the child NodeShape). This is valid in OWL/SHACL
 * but violates DTDL v2, which forbids redefining inherited content
 * names.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";

export const DedupInheritedHandler: TripleHandler = {
  name: "DedupInherited",

  handle(_store: TripleStore, ctx: ConversionContext): void {
    for (const [classIri, iface] of ctx.interfaces) {
      if (!iface.contents || iface.contents.length === 0) continue;

      const ancestorNames = collectAncestorNames(classIri, ctx);
      if (ancestorNames.size === 0) continue;

      const before = iface.contents.length;
      iface.contents = iface.contents.filter((c) => {
        if (!("name" in c)) return true;
        return !ancestorNames.has(c.name);
      });

      const removed = before - iface.contents.length;
      if (removed > 0) {
        ctx.stats.dedupCount += removed;
      }
    }
  },
};

function collectAncestorNames(
  classIri: string,
  ctx: ConversionContext
): Set<string> {
  const names = new Set<string>();
  let current = ctx.classHierarchy.get(classIri) ?? null;

  while (current) {
    const parentIface = ctx.interfaces.get(current);
    if (parentIface?.contents) {
      for (const c of parentIface.contents) {
        if ("name" in c) names.add(c.name);
      }
    }
    current = ctx.classHierarchy.get(current) ?? null;
  }

  return names;
}
