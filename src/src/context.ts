/**
 * ConversionContext — shared mutable state passed through all pipeline handlers.
 */
import type { DTDLInterface, LocalizedString } from "./dtdl-types.js";
import type { DtdlProfile } from "./dtdl-profile.js";
import type { ConverterConfig } from "./config.js";

export interface PropertyDef {
  iri: string;
  localName: string;
  kind: "object" | "datatype";
  labels: LocalizedString;
  comments: LocalizedString;
  range?: string;              // IRI of rdfs:range
  domain?: string;             // IRI of rdfs:domain
  subPropertyOf?: string;      // IRI of rdfs:subPropertyOf
  inverseOf?: string;          // IRI of owl:inverseOf
  characteristics: string[];   // e.g. ["AsymmetricProperty", "IrreflexiveProperty"]
}

export interface ShapeDef {
  iri: string;
  path: string;                // IRI of sh:path (the property this constrains)
  targetClasses: string[];     // IRIs from sh:class
  datatype?: string;           // IRI from sh:datatype
  maxCount?: number;
  minCount?: number;
  inValues?: string[];         // Values from sh:in list
  message?: string;
}

export interface ConversionContext {
  profile: DtdlProfile;
  baseNamespace: string;
  config: ConverterConfig;

  // Accumulated output
  interfaces: Map<string, DTDLInterface>;

  // Lookup tables built by indexing stages
  classHierarchy: Map<string, string | null>;    // class IRI → parent IRI (null = root)
  classLabels: Map<string, LocalizedString>;
  classComments: Map<string, LocalizedString>;
  classProperties: Map<string, string[]>;        // class IRI → shape IRIs attached via sh:property
  propertyDefinitions: Map<string, PropertyDef>;
  shapeDefinitions: Map<string, ShapeDef>;       // keyed by shape IRI
  shapesByPath: Map<string, ShapeDef[]>;         // property IRI → shapes for that property

  // Diagnostics
  warnings: string[];
  skipped: SkippedItem[];
  semanticNotes: SemanticNote[];
  stats: ConversionStats;
}

export interface SemanticNote {
  /** Property local name */
  property: string;
  /** OWL characteristics or inverse info lost in translation */
  note: string;
}

export interface SkippedItem {
  /** IRI of the subject that was skipped */
  iri: string;
  /** Why this was skipped */
  reason: string;
}

export interface ConversionStats {
  classCount: number;
  interfaceCount: number;
  relationshipCount: number;
  propertyCount: number;
  componentCount: number;
  enumCount: number;
  dedupCount: number;
  warningCount: number;
}

export function createContext(
  profile: DtdlProfile,
  baseNamespace: string,
  config?: ConverterConfig
): ConversionContext {
  return {
    profile,
    baseNamespace,
    config: config ?? { components: { detect: true, include: [], exclude: [] }, orphanedProperties: "skip" },
    interfaces: new Map(),
    classHierarchy: new Map(),
    classLabels: new Map(),
    classComments: new Map(),
    classProperties: new Map(),
    propertyDefinitions: new Map(),
    shapeDefinitions: new Map(),
    shapesByPath: new Map(),
    warnings: [],
    skipped: [],
    semanticNotes: [],
    stats: {
      classCount: 0,
      interfaceCount: 0,
      relationshipCount: 0,
      propertyCount: 0,
      componentCount: 0,
      enumCount: 0,
      dedupCount: 0,
      warningCount: 0,
    },
  };
}
