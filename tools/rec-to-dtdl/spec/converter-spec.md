# OWL/SHACL Turtle to DTDL Converter — Specification

## 1. Purpose

A CLI tool that reads one or more OWL/SHACL Turtle files, converts them into DTDL (Digital Twin Definition Language) models, and writes the output as a folder structure of JSON files.

The tool is designed to work with any Turtle ontology that follows the REC design principles (OWL classes + SHACL shapes), not just the REC ontology itself. It has been tested against both REC and Brick Schema.

This is conceptually the **reverse** of the translation described in `docs/ontology-principles.pdf` (which went DTDL → OWL/SHACL). The patterns documented there serve as the authoritative mapping reference.

## 2. CLI Interface

```
rec-to-dtdl [options] <input-files...>

Options:
  -o, --output <dir>       Output directory for DTDL models (required)
  -c, --context <version>  DTDL context version: "v2" | "v3" (default: "v2")
  --config <file>          Path to JSON configuration file (optional)
  --dry-run                Parse and report without writing files
  -v, --verbose            Verbose logging
  -h, --help               Show help
```

### Examples

```bash
cd tools/rec-to-dtdl

# Single file
npx tsx src/cli.ts -o ../../output ../../ontology/rec-ontology-configured.ttl

# Multiple files
npx tsx src/cli.ts -o ../../output ../../ontology/core.ttl ../../ontology/spaces.ttl

# With configuration
npx tsx src/cli.ts -o ../../output --config config.json ../../Brick.ttl

# Dry run (no output files written)
npx tsx src/cli.ts -o ../../output --dry-run ../../ontology/*.ttl
```

## 3. High-Level Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  TTL Files   │────▶│  RDF Parse   │────▶│  Triple      │────▶│  DTDL JSON   │
│  (input)     │     │  & Merge     │     │  Pipeline    │     │  (output)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │
                      Unified triple        Ordered chain of
                      store (in-memory)     10 TripleHandlers
```

The core idea: **everything is triples**. All Turtle input is parsed into a single in-memory triple store. A pipeline of **handlers** then queries the store for specific triple patterns and emits DTDL fragments. This makes the system easy to extend — add a new handler for a new OWL/SHACL pattern.

## 4. Core Concepts

### 4.1 Triple Store

All input files are parsed with N3.js into a single merged triple store. The store supports:

- Pattern queries: `store.match(subject?, predicate?, object?)` — any position can be `null` for wildcard.
- Convenience accessors: `store.object(s, p)`, `store.objects(s, p)`, `store.labels(s)`.
- RDF list resolution: `store.resolveList(head)` — follows `rdf:first`/`rdf:rest` chains.
- Prefix resolution: Resolve compact IRIs like `rec:Space` to full URIs.

The triple store is **read-only** after loading. All conversion is done by reading patterns.

### 4.2 Conversion Context

A shared mutable object passed through all handlers:

```typescript
interface ConversionContext {
  profile: DtdlProfile;
  baseNamespace: string;
  config: ConverterConfig;

  // Accumulated output
  interfaces: Map<string, DTDLInterface>;

  // Lookup tables built by indexing stages
  classHierarchy: Map<string, string | null>;    // class IRI → parent IRI (null = root)
  classLabels: Map<string, LocalizedString>;
  classComments: Map<string, LocalizedString>;
  classProperties: Map<string, string[]>;        // class IRI → shape IRIs
  propertyDefinitions: Map<string, PropertyDef>;
  shapeDefinitions: Map<string, ShapeDef>;       // keyed by shape IRI
  shapesByPath: Map<string, ShapeDef[]>;         // property IRI → shapes for that property

  // Diagnostics
  warnings: string[];
  skipped: SkippedItem[];
  semanticNotes: SemanticNote[];
  stats: ConversionStats;
}
```

### 4.3 Handler Interface

Each handler is a function that reads from the triple store and writes to the context:

```typescript
interface TripleHandler {
  name: string;
  handle(store: TripleStore, ctx: ConversionContext): void;
}
```

## 5. Pipeline Stages

The pipeline is an ordered array of 10 handlers. Order matters — some stages populate lookup tables that later stages consume.

### Stage 1: `IndexClassesHandler`

**Reads:** All triples matching `?s a owl:Class`.
**Also reads:** `rdfs:subClassOf`, `rdfs:label` (all languages), `rdfs:comment` (all languages).
**Writes to context:** `classHierarchy`, `classLabels`, `classComments` maps.
**Purpose:** Build a complete picture of the class tree before generating any DTDL.

### Stage 2: `IndexPropertiesHandler`

**Reads:** Triples matching `?s a owl:ObjectProperty` and `?s a owl:DatatypeProperty`.
**Also reads:** `rdfs:subPropertyOf`, `rdfs:label`, `rdfs:range`, `rdfs:domain`, `owl:inverseOf`, and OWL property characteristics (`owl:AsymmetricProperty`, `owl:IrreflexiveProperty`).
**Writes to context:** `propertyDefinitions` map.

### Stage 3: `IndexShapesHandler`

Handles two patterns:

1. **Named PropertyShapes** (REC pattern): Triples matching `?s a sh:PropertyShape`. These are explicitly typed shapes with IRIs.
2. **Inline/anonymous shapes** (Brick pattern): Blank node shapes referenced via `sh:property` on a NodeShape. These are discovered by following `sh:property` links from classes in the hierarchy.

**Also reads:** `sh:path`, `sh:class`, `sh:datatype`, `sh:maxCount`, `sh:minCount`, `sh:in`, `sh:message`, `sh:or`.

**sh:or resolution:** When a shape has `sh:or` instead of `sh:class`, the handler resolves the RDF list and collects all `sh:class` values from the constraint nodes. This produces the union of target classes.

**sh:in resolution:** When a shape has `sh:in`, the RDF list is resolved to extract the allowed values.

**Writes to context:** `shapeDefinitions` map (keyed by shape IRI), `shapesByPath` map (keyed by property IRI), `classProperties` map (class IRI → shape IRIs).

### Stage 4: `ClassToInterfaceHandler`

**Reads from context:** `classHierarchy`, `classLabels`, `classComments`.
**Produces:** A `DTDLInterface` for each `owl:Class`.

**Extends safety:** Only sets `extends` if the parent IRI exists in `classHierarchy` (i.e., the parent is also an `owl:Class` that will become an interface). This prevents dangling references — e.g., `rec:Entity` is referenced as a parent by several classes but is not declared as `owl:Class` in the ontology, so referencing it would produce a DTMI that Azure Digital Twins cannot resolve.

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:Class` IRI | `@id` — DTMI derived from IRI (see §6) |
| `rdfs:subClassOf` | `extends` — DTMI of parent (only if parent is a known owl:Class) |
| `rdfs:label` (all languages) | `displayName` |
| `rdfs:comment` (all languages) | `description` |

### Stage 5: `ObjectPropertyToRelationshipHandler`

**Reads from context:** `propertyDefinitions` (ObjectProperty entries), `shapeDefinitions`, `classProperties`.
**Produces:** DTDL `Relationship` entries on the appropriate interfaces.

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:ObjectProperty` local name | `name` |
| `sh:class` on corresponding shape (single value) | `target` — DTMI of target class |
| `sh:class` with union range (via `sh:or`) | `target` omitted, warning emitted |
| `sh:maxCount` | `maxMultiplicity` |
| `sh:minCount` | `minMultiplicity` (v3 only) |
| `rdfs:label` | `displayName` |
| `rdfs:comment` | `description` |

**Placement:** A relationship is placed on the interface whose NodeShape declares it via `sh:property`. If no NodeShape claims it, it falls back to `rdfs:domain`. If neither, the orphaned property handling mode (see §9) determines behavior.

**Union ranges:** When a shape has multiple target classes (via `sh:or`), the `target` is omitted entirely rather than picking one arbitrarily. DTDL allows relationships without a target. A warning is emitted listing the candidate classes.

**OWL characteristics:** `owl:inverseOf`, `owl:AsymmetricProperty`, `owl:IrreflexiveProperty` have no DTDL equivalent. These are recorded in `ctx.semanticNotes` and appear in the conversion report (see §10), not embedded in the DTDL output.

### Stage 6: `DatatypePropertyToPropertyHandler`

**Reads from context:** `propertyDefinitions` (DatatypeProperty entries), `shapeDefinitions`, `classProperties`.
**Produces:** DTDL `Property` entries on the appropriate interfaces.

Mapping rules:

| OWL/SHACL | DTDL |
|-----------|------|
| `owl:DatatypeProperty` local name | `name` |
| `sh:datatype` / `rdfs:range` | `schema` (see §7 for type mapping) |
| `rdfs:label` | `displayName` |
| `rdfs:comment` | `description` |

**Placement:** Same logic as relationships — via `sh:property` on NodeShape, then `rdfs:domain`, then orphaned property handling mode.

### Stage 7: `EnumerationHandler`

**Reads:** SHACL `sh:in` constraints found during shape indexing.
**Produces:** Inline DTDL `Enum` schemas on Properties.

Handles two cases:
1. An existing Property (from Stage 6) that has a matching shape with `sh:in` — replaces its `schema` with an Enum.
2. A shape with `sh:in` that has no existing Property — creates a new Property with the Enum schema. If a Relationship with the same name already exists (common in Brick where `sh:class` and `sh:in` coexist on the same path), the Relationship is removed since the Enum is more specific.

**Enum value name sanitization:** Values from `sh:in` may be full IRIs (e.g., `http://qudt.org/vocab/unit/DEG_C`). DTDL requires enum value names to match `[a-zA-Z_][a-zA-Z0-9_]*` (max 64 chars). The converter:
1. Extracts the local name from the IRI (part after `#` or last `/`)
2. Replaces invalid characters with underscores
3. Prepends `_` if the name starts with a digit
4. Truncates to 64 characters
5. Deduplicates colliding names with numeric suffixes (`Active`, `Active_2`, `Active_3`)

The full IRI is preserved in the `enumValue` field.

```
sh:in (qudt:DEG_C qudt:DEG_F qudt:K)  →  schema: {
  @type: "Enum",
  valueSchema: "string",
  enumValues: [
    { name: "DEG_C", enumValue: "http://qudt.org/vocab/unit/DEG_C" },
    { name: "DEG_F", enumValue: "http://qudt.org/vocab/unit/DEG_F" },
    { name: "K", enumValue: "http://qudt.org/vocab/unit/K" }
  ]
}
```

### Stage 8: `ComponentHandler`

Detects OWL patterns that represent DTDL Components. In OWL/SHACL there is no component concept, so anything component-like is modelled as a class with an object property.

**Heuristic detection** (when `config.components.detect` is true):

A relationship is promoted to a Component when all of these hold:
1. The shape constraining the property has `sh:maxCount 1`
2. The range class is a "leaf" — it has no outgoing ObjectProperties of its own (i.e., it would be a simple value holder, not a complex entity)
3. The range class exists in the loaded ontology (not an external reference)

**Naming:** The component `name` is the object property's local name as-is from the ontology. No prefix stripping or name invention — the converter is faithful to the ontology naming.

**Configuration:** Component detection can be controlled via config (see §9):
- `detect: true/false` — enable/disable heuristic detection
- `include: [...]` — always treat these properties as components regardless of heuristic
- `exclude: [...]` — never treat these properties as components

When a relationship is promoted to a component, the original Relationship entry is removed from the interface contents.

### Stage 9: `ExtensionShapesHandler`

**Reads:** NodeShapes with `sh:targetClass` — the REC 5 extension pattern where external ontologies declare new properties on existing classes.

```turtle
ex:SpaceExtensionShape a sh:NodeShape ;
  sh:targetClass rec:Space ;
  sh:property ex:customEnergyRatingShape .
```

The handler adds the extension's properties to the targeted interface. Skips properties that already exist on the interface to avoid duplicates.

### Stage 10: `DedupInheritedHandler`

**Purpose:** Remove contents that duplicate a name already defined in a parent interface.

Brick uses SHACL property refinement in subclasses — re-declaring `sh:property` on a child NodeShape to narrow constraints. This is valid in OWL/SHACL but violates DTDL v2, which forbids redefining inherited content names.

**Algorithm:** For each interface, walks the `classHierarchy` chain upward collecting all content names from ancestor interfaces. Any content on the current interface whose name appears in that ancestor set is removed.

**Example:** If `Equipment` defines `feeds` and `hasPart`, and `HVAC_Equipment` (which extends `Equipment`) also defines `feeds` and `hasPart`, the duplicates are removed from `HVAC_Equipment`. The grandparent chain is also walked — an `AHU` extending `HVAC_Equipment` will not redefine anything from `Equipment` either.

## 6. DTMI Generation

IRIs are converted to DTMIs (Digital Twin Model Identifiers):

```
http://w3id.org/rec#Space  →  dtmi:org:w3id:rec:Space;1
```

**Algorithm:**
1. Check known namespace mappings first (e.g., `http://w3id.org/rec#` → `dtmi:org:w3id:rec`).
2. Otherwise: strip protocol, reverse the domain segments, keep path segments in order, extract the local name (after `#` or last `/`).
3. Sanitize each segment: only `[a-zA-Z0-9_]`, must not start with digit, must not end with underscore.
4. Compose: `dtmi:{segments}:{localName};{version}`

The version suffix (`;1`) is always `1` but is configurable in code.

Known namespace mappings:
```
http://w3id.org/rec#           → dtmi:org:w3id:rec
https://brickschema.org/schema/Brick# → dtmi:org:brickschema:schema:Brick
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

```
<output-dir>/
├── models/
│   ├── Space.json
│   ├── Building.json
│   ├── Equipment.json
│   ├── HVAC_Equipment.json
│   ├── AHU.json
│   └── ...
└── conversion-report.md
```

**Folder nesting (REC):** When running against REC, classes whose parent is a "major" REC class (Entity, Space, Asset, Agent, Event, Collection, BuildingElement, Information) get files at the top level. Deeper subclasses are grouped into folders named after their nearest major ancestor. For non-REC ontologies (e.g., Brick), all files go to the top-level `models/` folder.

Each JSON file contains a single DTDL Interface. Empty `contents` arrays are omitted.

The `@context` value varies by CLI flag:
- `-c v2` → `"dtmi:dtdl:context;2"`
- `-c v3` → `"dtmi:dtdl:context;3"`

## 9. Configuration File (optional)

An optional JSON config file controls conversion behavior:

```json
{
  "components": {
    "detect": true,
    "include": ["hasArea", "hasCapacity"],
    "exclude": ["hasGeometry"]
  },
  "orphanedProperties": "skip"
}
```

### Component Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `detect` | boolean | `true` | Enable heuristic component detection |
| `include` | string[] | `[]` | Property IRIs or local names to always treat as components |
| `exclude` | string[] | `[]` | Property IRIs or local names to never treat as components |

### Orphaned Property Handling

Properties that have no owning class (no SHACL shape linking them to a class, and no `rdfs:domain`) are "orphaned." The `orphanedProperties` setting controls what happens:

| Mode | Behavior |
|------|----------|
| `"skip"` (default) | Silently skip — the property appears in the "Skipped" section of the report |
| `"report"` | Skip but also emit a warning, making orphans more prominent |
| `"root"` | Attach the property to every root interface (classes with no parent) |

## 10. Conversion Report

A `conversion-report.md` file is written alongside the models. It contains:

1. **Summary**: Counts of classes, interfaces, relationships, properties, components, enumerations, and inherited duplicates removed.

2. **Warnings**: Issues encountered during conversion (union ranges, unknown datatypes, orphaned properties in report mode).

3. **Skipped (not converted)**: Items the converter could not place — typically orphaned properties with no owning class.

4. **Semantic Properties Lost in Translation**: OWL characteristics (`owl:AsymmetricProperty`, `owl:IrreflexiveProperty`) and `owl:inverseOf` relationships that have no DTDL equivalent. These are documented here rather than embedded in the DTDL output.

## 11. Handling Constructs Without Direct DTDL Mapping

| Construct | Strategy |
|-----------|----------|
| `owl:inverseOf` | Documented in conversion report (semanticNotes) |
| `owl:AsymmetricProperty` | Documented in conversion report (semanticNotes) |
| `owl:IrreflexiveProperty` | Documented in conversion report (semanticNotes) |
| `owl:unionOf` / `sh:or` ranges | Omit `target` on relationship, emit warning |
| `sh:message` | Map to `description` if no `rdfs:comment` exists |
| `rdfs:subPropertyOf` | Drop (DTDL has no property hierarchy) |
| External class references | Emit as `target` DTMI; the external Interface is not generated |
| SHACL property refinement in subclasses | Removed by Stage 10 dedup (DTDL forbids inherited name redefinition) |
| `sh:in` values that are IRIs | Local name extracted, sanitized to valid DTDL identifier |
| Dangling `extends` to non-owl:Class | `extends` omitted to avoid unresolvable references |

## 12. DTDL Version Abstraction

The DTDL context version is isolated behind a profile abstraction:

```typescript
interface DtdlProfile {
  contextUrl: string;               // "dtmi:dtdl:context;2" or ";3"
  supportsMinMultiplicity: boolean;  // v3 only
  maxExtendsCount: number;           // v2: 2, v3: configurable
}
```

Handlers check the profile when emitting features that differ between versions.

## 13. Extensibility: Adding New Handlers

To support a new OWL/SHACL pattern:

1. Create a new file implementing `TripleHandler`.
2. Register it in the pipeline array (`handlers/index.ts`) at the appropriate position.
3. The handler reads triples from the store and/or data from context, and writes DTDL fragments.

## 14. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety, good RDF libs |
| RDF Parsing | `n3` (N3.js) | Mature, fast, supports Turtle/N-Triples/N-Quads |
| CLI Framework | `commander` | Lightweight, standard |
| JSON Output | Built-in `JSON.stringify` | Pretty-printed with 2-space indent |
| Build | `tsx` for dev, `tsc` for dist | Fast iteration |
| Testing | `vitest` | Fast, TS-native |
| Package Manager | `npm` | Standard |

## 15. Project Layout

```
tools/
└── rec-to-dtdl/                      # Converter package
    ├── package.json
    ├── tsconfig.json
    ├── spec/
    │   └── converter-spec.md         # This document
    └── src/
        ├── cli.ts                    # CLI entry point (commander setup)
        ├── convert.ts                # Main orchestrator: load → pipeline → write
        ├── triple-store.ts           # Thin wrapper around N3.Store
        ├── context.ts                # ConversionContext type and factory
        ├── config.ts                 # ConverterConfig type and loader
        ├── dtdl-types.ts             # TypeScript types for DTDL v2/v3 structures
        ├── dtdl-profile.ts           # Version abstraction (v2 vs v3 capabilities)
        ├── dtmi.ts                   # IRI → DTMI conversion
        ├── datatype-map.ts           # XSD → DTDL schema mapping
        ├── namespaces.ts             # RDF/RDFS/OWL/XSD/SH namespace constants
        ├── writer.ts                 # Writes DTDL interfaces + conversion report
        ├── handlers/
        │   ├── handler.ts            # TripleHandler interface
        │   ├── index.ts              # Pipeline definition (ordered handler array)
        │   ├── index-classes.ts      # Stage 1: Index owl:Class hierarchy
        │   ├── index-properties.ts   # Stage 2: Index OWL properties
        │   ├── index-shapes.ts       # Stage 3: Index SHACL shapes (named + inline)
        │   ├── class-to-interface.ts # Stage 4: Class → Interface
        │   ├── object-prop-to-rel.ts # Stage 5: ObjectProperty → Relationship
        │   ├── datatype-prop-to-prop.ts # Stage 6: DatatypeProperty → Property
        │   ├── enumeration.ts        # Stage 7: sh:in → Enum schema
        │   ├── component.ts          # Stage 8: Configurable component detection
        │   ├── extension-shapes.ts   # Stage 9: sh:targetClass extensions
        │   ├── dedup-inherited.ts    # Stage 10: Remove inherited duplicate contents
        │   ├── component.test.ts     # Tests for component detection
        │   ├── enumeration.test.ts   # Tests for enum sanitization
        │   └── dedup-inherited.test.ts # Tests for inheritance dedup
        ├── config.test.ts            # Tests for config loading
        └── report.test.ts            # Tests for report writing
```

## 16. Error Handling & Diagnostics

- **Parse errors:** If a Turtle file cannot be parsed, abort with a clear message and exit code 1.
- **Warnings:** Collected in `ctx.warnings`. Printed with `--verbose`. Examples:
  - "Union range on meters — omitting target (candidates: Equipment, Location, Collection)"
  - "Unknown datatype xsd:nonNegativeInteger — defaulting to string"
  - "Orphaned property X — no owning class found" (in "report" mode)
- **Skipped items:** Tracked in `ctx.skipped` with reason. Listed in the conversion report.
- **Semantic notes:** OWL characteristics and inverse properties that cannot be represented in DTDL.
- **Stats:** Printed at end: classes, interfaces, relationships, properties, components, enumerations, inherited duplicates removed, warnings, skipped count.
- **`--dry-run`:** Runs the full pipeline but skips writing files. Prints stats only.

## 17. Test Results

### REC Ontology

| Metric | Count |
|--------|-------|
| Classes | 204 |
| Interfaces | 204 (100%) |
| Relationships | 43 |
| Properties | 52 |
| Components | 5 |
| Enumerations | 0 |
| Skipped | 0 |

### Brick Schema (v1.4.1)

| Metric | Count |
|--------|-------|
| Classes | 1530 |
| Interfaces | 1530 (100%) |
| Relationships | 116 |
| Properties | 101 |
| Components | 0 |
| Enumerations | 79 |
| Inherited duplicates removed | 20 |
| Skipped | 112 (orphaned properties) |

## 18. Key Design Decisions

1. **Triples-first:** By reducing everything to triples before conversion, we avoid coupling to Turtle syntax details. If an ontology ships as JSON-LD or RDF/XML, only the parser changes.

2. **Handler pipeline over monolithic converter:** Each OWL/SHACL pattern is isolated in its own handler. Adding support for a new pattern is one file, not a rewrite.

3. **Index-then-convert:** Stages 1–3 build lookup tables. Stages 4–10 consume them. This two-phase approach means a handler converting a class to an interface can efficiently look up "which properties belong to this class?" without re-scanning all triples.

4. **DTDL version as a profile:** The `DtdlProfile` abstraction means v3 support is adding a profile object, not threading conditionals everywhere.

5. **Faithful translation:** Nothing is added or removed. Names come from the ontology. OWL semantics that DTDL cannot represent are documented in the conversion report, not silently dropped or approximated.

6. **Configurable component detection:** Since OWL/SHACL has no component concept, detection is heuristic-based and can be tuned via configuration.

7. **Orphaned property modes:** Different ontologies handle property-to-class linkage differently. The three modes (skip/report/root) let users choose the right strategy for their ontology.

8. **Dedup as a final pass:** Rather than preventing duplicates during conversion (which would require each handler to know about inheritance), a clean-up stage at the end walks the hierarchy and removes them. This keeps earlier handlers simple and independent.
