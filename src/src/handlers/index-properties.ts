/**
 * Stage 2: Index all OWL ObjectProperties and DatatypeProperties.
 */
import type { TripleHandler } from "./handler.js";
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext, PropertyDef } from "../context.js";
import {
  RDF_TYPE,
  OWL_OBJECT_PROPERTY,
  OWL_DATATYPE_PROPERTY,
  OWL_ASYMMETRIC_PROPERTY,
  OWL_IRREFLEXIVE_PROPERTY,
  OWL_INVERSE_OF,
  RDFS_SUB_PROPERTY_OF,
  RDFS_LABEL,
  RDFS_COMMENT,
  RDFS_RANGE,
  RDFS_DOMAIN,
} from "../namespaces.js";

export const IndexPropertiesHandler: TripleHandler = {
  name: "IndexProperties",

  handle(store: TripleStore, ctx: ConversionContext): void {
    // Index object properties
    for (const quad of store.match(null, RDF_TYPE, OWL_OBJECT_PROPERTY)) {
      if (quad.subject.termType !== "NamedNode") continue;
      indexProperty(store, ctx, quad.subject.value, "object");
    }

    // Index datatype properties
    for (const quad of store.match(null, RDF_TYPE, OWL_DATATYPE_PROPERTY)) {
      if (quad.subject.termType !== "NamedNode") continue;
      indexProperty(store, ctx, quad.subject.value, "datatype");
    }
  },
};

function indexProperty(
  store: TripleStore,
  ctx: ConversionContext,
  iri: string,
  kind: "object" | "datatype"
): void {
  const subject = store.store.getQuads(iri, null, null, null)[0]?.subject;
  if (!subject) return;

  const labels = store.labels(subject, RDFS_LABEL);
  const comments = store.labels(subject, RDFS_COMMENT);
  const range = store.object(subject, RDFS_RANGE)?.value;
  const domain = store.object(subject, RDFS_DOMAIN)?.value;
  const subPropertyOf = store.object(subject, RDFS_SUB_PROPERTY_OF)?.value;
  const inverseOf = store.object(subject, OWL_INVERSE_OF)?.value;

  // Check for property characteristics
  const characteristics: string[] = [];
  const types = store.objects(subject, RDF_TYPE);
  for (const t of types) {
    if (t.value === OWL_ASYMMETRIC_PROPERTY.value) {
      characteristics.push("AsymmetricProperty");
    }
    if (t.value === OWL_IRREFLEXIVE_PROPERTY.value) {
      characteristics.push("IrreflexiveProperty");
    }
  }

  const localName = iri.includes("#")
    ? iri.slice(iri.lastIndexOf("#") + 1)
    : iri.slice(iri.lastIndexOf("/") + 1);

  const def: PropertyDef = {
    iri,
    localName,
    kind,
    labels,
    comments,
    range,
    domain,
    subPropertyOf,
    inverseOf,
    characteristics,
  };

  ctx.propertyDefinitions.set(iri, def);
}
