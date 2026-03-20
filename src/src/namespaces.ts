/**
 * Well-known RDF namespace constants.
 */
import { DataFactory } from "n3";

const { namedNode } = DataFactory;

export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
export const OWL = "http://www.w3.org/2002/07/owl#";
export const XSD = "http://www.w3.org/2001/XMLSchema#";
export const SH = "http://www.w3.org/ns/shacl#";
export const REC = "http://w3id.org/rec#";
export const BRICK = "https://brickschema.org/schema/Brick#";

// Commonly used named nodes
export const RDF_TYPE = namedNode(RDF + "type");

export const OWL_CLASS = namedNode(OWL + "Class");
export const OWL_OBJECT_PROPERTY = namedNode(OWL + "ObjectProperty");
export const OWL_DATATYPE_PROPERTY = namedNode(OWL + "DatatypeProperty");
export const OWL_ASYMMETRIC_PROPERTY = namedNode(OWL + "AsymmetricProperty");
export const OWL_IRREFLEXIVE_PROPERTY = namedNode(OWL + "IrreflexiveProperty");
export const OWL_INVERSE_OF = namedNode(OWL + "inverseOf");

export const RDFS_SUBCLASS_OF = namedNode(RDFS + "subClassOf");
export const RDFS_SUB_PROPERTY_OF = namedNode(RDFS + "subPropertyOf");
export const RDFS_LABEL = namedNode(RDFS + "label");
export const RDFS_COMMENT = namedNode(RDFS + "comment");
export const RDFS_RANGE = namedNode(RDFS + "range");
export const RDFS_DOMAIN = namedNode(RDFS + "domain");

export const SH_NODE_SHAPE = namedNode(SH + "NodeShape");
export const SH_PROPERTY_SHAPE = namedNode(SH + "PropertyShape");
export const SH_PROPERTY = namedNode(SH + "property");
export const SH_PATH = namedNode(SH + "path");
export const SH_CLASS = namedNode(SH + "class");
export const SH_DATATYPE = namedNode(SH + "datatype");
export const SH_MAX_COUNT = namedNode(SH + "maxCount");
export const SH_MIN_COUNT = namedNode(SH + "minCount");
export const SH_IN = namedNode(SH + "in");
export const SH_MESSAGE = namedNode(SH + "message");
export const SH_OR = namedNode(SH + "or");

export const RDF_FIRST = namedNode(RDF + "first");
export const RDF_REST = namedNode(RDF + "rest");
export const RDF_NIL = namedNode(RDF + "nil");
