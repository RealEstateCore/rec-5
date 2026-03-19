# REC OWL/SHACL Turtle to DTDL Converter — Specification

## 1. Purpose

A CLI tool that reads one or more REC OWL/SHACL Turtle files, converts them into DTDL (Digital Twin Definition Language) models, and writes the output as a folder structure of JSON files.

This is conceptually the **reverse** of the translation described in `docs/ontology-principles.pdf` (which went DTDL → OWL/SHACL). The patterns documented there serve as the authoritative mapping reference.

## 2. CLI Interface

```
rec-to-dtdl [options] <input-files...>

Options:
  -o, --output <dir>       Output directory for DTDL models (required)
  -c, --context <version>  DTDL context version: "v2" | "v3" (default: "v2")
  --dry-run                Parse and report without writing files
  -v, --verbose            Verbose logging
  -h, --help               Show help
```

### Examples

```bash
# Single file
rec-to-dtdl -o ./dtdl-output ontology/rec-ontology-configured.ttl

# Multiple files (future: split ontology)
rec-to-dtdl -o ./dtdl-output ontology/core.ttl ontology/spaces.ttl ontology/assets.ttl

# DTDL v3 context
rec-to-dtdl -o ./dtdl-output -c v3 ontology/*.ttl
```

## 3. High-Level Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  TTL Files   │────▶│  RDF Parse   │────▶│  Triple      │────▶│  DTDL JSON   │
│  (input)     │     │  & Merge     │     │  Pipeline    │     │  (output)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │
                      Unified triple        Ordered chain
                      store (in-memory)     of TripleHandlers
```

The core idea: **everything is triples**. All Turtle input is parsed into a single in-memory triple store. A pipeline of **handlers** then queries the store for specific triple patterns and emits DTDL fragments. This makes the system easy to extend — add a new handler for a new OWL/SHACL pattern.

## 4. Core Concepts

### 4.1 Triple Store

All input files are parsed with a standard RDF/Turtle parser (e.g., `n3.js`) into a single merged triple store. The store supports:

- Pattern queries: `store.match(subject?, predicate?, object?)` — any position can be `null` for wildcard.
- Prefix resolution: Resolve compact IRIs like `rec:Space` to full URIs.

The triple store is **read-only** after loading. All conversion is done by reading patterns.

### 4.2 Conversion Context

A shared mutable object passed through all handlers:

```typescript
interface ConversionContext {
  // Configuration
  dtdlVersion: "v2" | "v3";
  baseNamespace: string;         // e.g. "http://w3id.org/rec#"

  // Accumulated output
  interfaces: Map<string, DTDLInterface>;

  // Lookup helpers populated during earlier pipeline stages
  classHierarchy: Map<string, string>;          // class → superclass IRI
  classProperties: Map<string, PropertyInfo[]>; // class → its sh:property shapes
  propertyDefinitions: Map<string, PropertyDef>;// property IRI → its OWL definition
  shapeDefinitions: Map<string, ShapeDef>;      // shape IRI → its SHACL definition

  // Diagnostics
  warnings: string[];
  stats: ConversionStats;
}
```

### 4.3 Handler Interface

Each handler is a function that reads from the triple store and writes to the context:

```typescript
interface TripleHandler {
  /** Human-readable name for logging */
  name: string;

  /**
   * Process triples from the store and update the conversion context.
   * Handlers run in a defined order — later handlers may depend on
   * data populated by earlier ones.
   */
  handle(store: TripleStore, ctx: ConversionContext): void;
}
```

## 5. Pipeline Stages

The pipeline is an ordered array of handlers. Order matters — some stages populate lookup tables that later stages consume.

### Stage 1: `IndexClassesHandler`

**Reads:** All triples matching `?s a owl:Class`.
**Also reads:** `?s rdfs:subClassOf ?parent`, `?s rdfs:label ?label`, `?s rdfs:comment ?comment`.
**Writes to context:** `classHierarchy` map.
**Purpose:** Build a complete picture of the class tree before generating any DTDL.

### Stage 2: `IndexPropertiesHandler`

**Reads:** Triples matching `?s a owl:ObjectProperty` and `?s a owl:DatatypeProperty`.
**Also reads:** `rdfs:subPropertyOf`, `rdfs:label`, `rdfs:range`, `rdfs:domain`, `owl:inverseOf`, and OWL property characteristics (`owl:AsymmetricProperty`, `owl:IrreflexiveProperty`).
**Writes to context:** `propertyDefinitions` map.

### Stage 3: `IndexShapesHandler`

**Reads:** Triples matching `?s a sh:PropertyShape`.
**Also reads:** `sh:path`, `sh:class`, `sh:datatype`, `sh:maxCount`, `sh:minCount`, `sh:in`, `sh:message`.
**Writes to context:** `shapeDefinitions` map, keyed by the `sh:path` value.

**Also reads:** Triples matching `?s a sh:NodeShape` (which are also `owl:Class`) and their `sh:property` links.
**Writes to context:** `classProperties` map — which shapes are attached to which class.

### Stage 4: `ClassToInterfaceHandler`

**Reads from context:** `classHierarchy`, plus labels/comments from stage 1.
**Produces:** A `DTDLInterface` for each `owl:Class` (excluding the root `rec:Entity` which becomes implicit).

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:Class` IRI | `@id` — DTMI derived from IRI (see §6) |
| `rdfs:subClassOf` | `extends` — DTMI of parent |
| `rdfs:label` (en) | `displayName.en` |
| `rdfs:label` (sv) | `displayName.sv` |
| `rdfs:comment` (en) | `description.en` |

### Stage 5: `ObjectPropertyToRelationshipHandler`

**Reads from context:** `propertyDefinitions` (ObjectProperty entries), `shapeDefinitions`, `classProperties`.
**Produces:** DTDL `Relationship` entries on the appropriate interfaces.

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:ObjectProperty` local name | `name` |
| `sh:class` on corresponding shape | `target` — DTMI of target class |
| `sh:maxCount 1` | `maxMultiplicity: 1` |
| No `sh:maxCount` | (unbounded, omit maxMultiplicity) |
| `sh:minCount` | `minMultiplicity` |
| `rdfs:label` | `displayName` |
| `rdfs:comment` | `description` |
| `sh:message` | `comment` (informational, not part of DTDL spec — stored in `description` or dropped) |

**Placement:** A relationship is placed on the interface whose NodeShape declares it via `sh:property`. If no NodeShape claims it, it is placed on the interface corresponding to its `rdfs:domain` (if present). If neither, a warning is emitted.

**Inverse properties:** `owl:inverseOf` does not have a direct DTDL equivalent. Recorded as a `comment` on the relationship for documentation. May be revisited in v3.

**Property characteristics:** `owl:AsymmetricProperty`, `owl:IrreflexiveProperty` — no direct DTDL mapping. Recorded in `comment`/`description` for documentation purposes.

### Stage 6: `DatatypePropertyToPropertyHandler`

**Reads from context:** `propertyDefinitions` (DatatypeProperty entries), `shapeDefinitions`, `classProperties`.
**Produces:** DTDL `Property` entries on the appropriate interfaces.

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:DatatypeProperty` local name | `name` |
| `rdfs:range` / `sh:datatype` | `schema` (see §7 for type mapping) |
| `sh:maxCount 1` | (default for DTDL Property) |
| `sh:in (...)` | `schema: { @type: "Enum", ... }` |
| `rdfs:label` | `displayName` |
| `rdfs:comment` or `sh:message` | `description` |

**Placement:** Same logic as relationships — via `sh:property` on NodeShape or `rdfs:domain`.

### Stage 7: `EnumerationHandler`

**Reads:** SHACL `sh:in` constraints found during shape indexing.
**Produces:** Inline DTDL `Enum` schemas on the corresponding Properties.

```
sh:in ("Major" "Minor" "Severe")  →  schema: {
  @type: "Enum",
  valueSchema: "string",
  enumValues: [
    { name: "Major", enumValue: "Major" },
    { name: "Minor", enumValue: "Minor" },
    { name: "Severe", enumValue: "Severe" }
  ]
}
```

### Stage 8: `ComponentHandler`

Detects the "intermediate class" pattern used for components in REC:
- A class like `rec:ArchitectureArea` that is linked via a dedicated ObjectProperty (e.g., `rec:hasArea`) with both `rdfs:domain` and `rdfs:range` set.
- The range class has only DatatypeProperties attached.

These are converted to DTDL `Component` entries rather than `Relationship` entries:

```
rec:hasArea (domain: Architecture, range: ArchitectureArea)
  → Component { name: "area", schema: "dtmi:org:w3id:rec:ArchitectureArea;1" }
```

A heuristic identifies component candidates. This can be overridden via configuration (see §9).

## 6. DTMI Generation

IRIs are converted to DTMIs (Digital Twin Model Identifiers):

```
http://w3id.org/rec#Space  →  dtmi:org:w3id:rec:Space;1
```

Algorithm:
1. Strip the fragment (`#Space`) to get the local name.
2. Convert the authority+path of the namespace to colon-separated segments:
   `http://w3id.org/rec` → `org:w3id:rec`
3. Compose: `dtmi:{segments}:{localName};1`

The version suffix (`;1`) is always `1` for now but is configurable.

External references (e.g., `brick:Point`) generate DTMIs in the Brick namespace:
```
https://brickschema.org/schema/Brick#Point  →  dtmi:org:brickschema:schema:Brick:Point;1
```

## 7. Datatype Mapping

| XSD / OWL | DTDL Schema |
|-----------|-------------|
| `xsd:string` | `"string"` |
| `xsd:integer` | `"integer"` |
| `xsd:float` | `"float"` |
| `xsd:double` | `"double"` |
| `xsd:boolean` | `"boolean"` |
| `xsd:date` | `"date"` |
| `xsd:dateTime` | `"dateTime"` |
| `xsd:duration` | `"duration"` |
| `xsd:anyURI` | `"string"` (DTDL has no URI type) |
| `xsd:long` | `"long"` |

Unknown types default to `"string"` with a warning.

## 8. Output Structure

Output mirrors a conventional DTDL project layout:

```
<output-dir>/
├── rec/
│   ├── Entity.json
│   ├── Space.json
│   ├── Building.json
│   ├── Room/
│   │   ├── ConferenceRoom.json
│   │   ├── Bathroom.json
│   │   └── ...
│   ├── Asset.json
│   ├── Agent.json
│   ├── Event.json
│   ├── Collection.json
│   ├── BuildingElement.json
│   └── Information/
│       ├── ArchitectureArea.json
│       ├── PostalAddress.json
│       └── ...
└── (optional) context.json   # shared @context if needed
```

**Folder nesting rule:** Classes whose parent is a "major" REC class (Entity, Space, Asset, Agent, Event, Collection, BuildingElement, Information) get their own file at the top level. Deeper subclasses are grouped into folders named after their nearest major ancestor.

Each JSON file contains a single DTDL Interface:

```json
{
  "@id": "dtmi:org:w3id:rec:Space;1",
  "@type": "Interface",
  "@context": "dtmi:dtdl:context;2",
  "displayName": {
    "en": "Space",
    "sv": "Utrymme"
  },
  "description": { ... },
  "extends": "dtmi:org:w3id:rec:Entity;1",
  "contents": [
    {
      "@type": "Relationship",
      "name": "geometry",
      "displayName": { "en": "geometry", "sv": "geometri" },
      "target": "dtmi:org:w3id:rec:Geometry;1",
      "maxMultiplicity": 1
    },
    {
      "@type": "Property",
      "name": "name",
      "displayName": { "en": "name" },
      "schema": "string"
    }
  ]
}
```

The `@context` value varies by CLI flag:
- `--context v2` → `"dtmi:dtdl:context;2"`
- `--context v3` → `"dtmi:dtdl:context;3"`

## 9. Configuration File (optional)

An optional JSON config file can tune conversion behavior:

```json
{
  "componentPatterns": [
    {
      "property": "rec:hasArea",
      "treatAs": "component"
    },
    {
      "property": "rec:hasCapacity",
      "treatAs": "component"
    },
    {
      "property": "rec:hasIdentifier",
      "treatAs": "component"
    }
  ],
  "excludeProperties": [
    "rec:customProperties",
    "rec:customTags"
  ],
  "majorClasses": [
    "rec:Entity", "rec:Space", "rec:Asset", "rec:Agent",
    "rec:Event", "rec:Collection", "rec:BuildingElement", "rec:Information"
  ],
  "dtmiVersion": 1,
  "externalNamespaces": {
    "https://brickschema.org/schema/Brick#": "dtmi:org:brickschema:schema:Brick"
  }
}
```

## 10. DTDL Version Abstraction

The DTDL context version is isolated behind a small abstraction so upgrading from v2 to v3 is straightforward:

```typescript
interface DtdlProfile {
  contextUrl: string;                    // "dtmi:dtdl:context;2" or ";3"
  supportsMinMultiplicity: boolean;      // v3 only
  supportsPropertyWritable: boolean;     // v3 only
  maxExtendsCount: number;               // v2: 2, v3: configurable
  // ... other version-specific capabilities
}
```

Handlers check the profile when emitting features that differ between versions. For v1 of the tool we only need to implement the v2 profile, but the abstraction ensures v3 is a config change + filling in the profile, not a rewrite.

## 11. Handling Constructs Without Direct DTDL Mapping

Several OWL/SHACL constructs have no DTDL equivalent. Strategy for each:

| Construct | Strategy |
|-----------|----------|
| `owl:inverseOf` | Drop (document in `description`) |
| `owl:AsymmetricProperty` | Drop (document in `description`) |
| `owl:IrreflexiveProperty` | Drop (document in `description`) |
| `owl:unionOf` ranges | Use the first class, warn, or omit `target` |
| `sh:message` | Map to `description` if no `rdfs:comment` exists |
| `rdfs:subPropertyOf` | Drop (DTDL has no property hierarchy) |
| External class references (brick:Point) | Emit as `target` DTMI; the external Interface is not generated |
| Multiple `sh:class` values on a shape | Pick first, warn |

All dropped information is tracked in the warnings list and optionally printed with `--verbose`.

## 12. Extensibility: Adding New Handlers

To support a new OWL/SHACL pattern:

1. Create a new class implementing `TripleHandler`.
2. Register it in the pipeline array at the appropriate position.
3. The handler reads triples from the store and/or data from context, and writes DTDL fragments.

Example — a future handler for `owl:TransitiveProperty`:

```typescript
const TransitivePropertyHandler: TripleHandler = {
  name: "TransitivePropertyHandler",
  handle(store, ctx) {
    for (const quad of store.match(null, RDF_TYPE, OWL_TRANSITIVE_PROPERTY)) {
      const propIri = quad.subject.value;
      const existing = ctx.propertyDefinitions.get(propIri);
      if (existing) {
        existing.annotations.push("transitive");
      }
    }
  }
};
```

## 13. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety, good RDF libs |
| RDF Parsing | `n3` (N3.js) | Mature, fast, supports Turtle/N-Triples/N-Quads |
| CLI Framework | `commander` | Lightweight, standard |
| JSON Output | Built-in `JSON.stringify` | Pretty-printed with 2-space indent |
| Build | `tsx` for dev, `tsc` for dist | Fast iteration |
| Testing | `vitest` | Fast, TS-native |
| Package Manager | `npm` | Standard |

## 14. Project Layout

```
src/
├── cli.ts                     # CLI entry point (commander setup)
├── convert.ts                 # Main orchestrator: load → pipeline → write
├── triple-store.ts            # Thin wrapper around N3.Store with helper queries
├── context.ts                 # ConversionContext type and factory
├── dtdl-types.ts              # TypeScript types for DTDL v2/v3 structures
├── dtdl-profile.ts            # Version abstraction (v2 vs v3 capabilities)
├── dtmi.ts                    # IRI → DTMI conversion
├── datatype-map.ts            # XSD → DTDL schema mapping
├── handlers/
│   ├── index.ts               # Pipeline definition (ordered handler array)
│   ├── index-classes.ts       # Stage 1
│   ├── index-properties.ts    # Stage 2
│   ├── index-shapes.ts        # Stage 3
│   ├── class-to-interface.ts  # Stage 4
│   ├── object-prop-to-rel.ts  # Stage 5
│   ├── datatype-prop-to-prop.ts # Stage 6
│   ├── enumeration.ts         # Stage 7
│   └── component.ts           # Stage 8
├── writer.ts                  # Writes DTDLInterfaces to folder structure
└── spec/
    └── converter-spec.md      # This document
```

## 15. Error Handling & Diagnostics

- **Parse errors:** If a Turtle file can't be parsed, abort with a clear message and exit code 1.
- **Warnings:** Collected in `context.warnings`. Printed at end. Examples:
  - "Property rec:owns has no sh:class — relationship target omitted"
  - "Union range on rec:includes — using first class rec:Architecture"
  - "Unknown datatype xsd:nonNegativeInteger — defaulting to string"
- **Stats:** Printed at end: number of interfaces, relationships, properties, components, warnings.
- **`--dry-run`:** Runs the full pipeline but skips writing files. Prints stats and warnings only.

## 16. First Iteration Scope

For v1, we implement:

- [x] Turtle parsing and triple store
- [x] All 8 pipeline stages
- [x] DTDL v2 context output
- [x] DTMI generation
- [x] Folder-structured JSON output
- [x] CLI with `commander`
- [x] Multilingual labels (en, sv)
- [ ] Configuration file loading (can hardcode defaults initially)
- [ ] DTDL v3 profile (deferred — v2 profile only)
- [ ] Validation of output against DTDL spec (deferred)

## 17. Key Design Decisions

1. **Triples-first:** By reducing everything to triples before conversion, we avoid coupling to Turtle syntax details. If REC later ships as JSON-LD or RDF/XML, only the parser changes.

2. **Handler pipeline over monolithic converter:** Each OWL/SHACL pattern is isolated in its own handler. Adding support for `owl:TransitiveProperty` or `sh:qualifiedValueShape` is one file, not a rewrite.

3. **Index-then-convert:** Stages 1-3 build lookup tables. Stages 4-8 consume them. This two-phase approach means a handler converting a class to an interface can efficiently look up "which properties belong to this class?" without re-scanning all triples.

4. **DTDL version as a profile:** The `DtdlProfile` abstraction means v3 support is adding a profile object, not threading conditionals everywhere.

5. **Output folder structure mirrors class hierarchy:** Makes the output navigable and diffable in version control.
