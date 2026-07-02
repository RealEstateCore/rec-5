/**
 * Pipeline definition — ordered array of handlers.
 * Order matters: stages 1-3 index, stages 4-8 convert.
 */
import type { TripleHandler } from "./handler.js";
import { IndexClassesHandler } from "./index-classes.js";
import { IndexPropertiesHandler } from "./index-properties.js";
import { IndexShapesHandler } from "./index-shapes.js";
import { ClassToInterfaceHandler } from "./class-to-interface.js";
import { ObjectPropertyToRelationshipHandler } from "./object-prop-to-rel.js";
import { DatatypePropertyToPropertyHandler } from "./datatype-prop-to-prop.js";
import { EnumerationHandler } from "./enumeration.js";
import { ComponentHandler } from "./component.js";
import { ExtensionShapesHandler } from "./extension-shapes.js";
import { DedupInheritedHandler } from "./dedup-inherited.js";

export const pipeline: TripleHandler[] = [
  // Indexing stages
  IndexClassesHandler,          // Stage 1
  IndexPropertiesHandler,       // Stage 2
  IndexShapesHandler,           // Stage 3

  // Conversion stages
  ClassToInterfaceHandler,      // Stage 4
  ObjectPropertyToRelationshipHandler, // Stage 5
  DatatypePropertyToPropertyHandler,   // Stage 6
  EnumerationHandler,           // Stage 7
  ComponentHandler,             // Stage 8
  ExtensionShapesHandler,       // Stage 9: SHACL extensions via sh:targetClass
  DedupInheritedHandler,        // Stage 10: Remove inherited duplicates
];
