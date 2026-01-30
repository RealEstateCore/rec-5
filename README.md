# RealEstateCore 5 (REC 5) — Working Repository

This repository contains the working draft of **RealEstateCore version 5**, the next-generation ontology for modeling real estate and building data.

## What's New in REC 5

REC 5 represents a significant architectural shift:

- **OWL/SHACL hybrid model** — Combines OWL reasoning capabilities with SHACL validation constraints, replacing the previous DTDL-based approach
- **Clean domain separation** — REC now focuses purely on real estate entities (spaces, assets, agents, collections), while ICT equipment and telemetry capabilities have migrated to [Brick Schema](https://brickschema.org/)
- **Universal entity architecture** — All REC concepts inherit from a single `rec:Entity` root class
- **Brick integration** — REC assets connect to Brick measurement points via `rec:hasPoint`, enabling rich sensor and equipment modeling without duplication
- **Multilingual support** — Full Swedish translations alongside English labels

## Breaking Changes

REC 5 introduces breaking changes from previous versions, including:

- Complete removal of ICT equipment hierarchy (21 classes migrated to Brick)
- Observation event restructuring (specific observation types replaced by generic events + Brick Points)
- Custom properties exclusion (use external SHACL extensions instead)

See [`docs/rec5-breaking-changes.pdf`](docs/rec5-breaking-changes.pdf) for the full migration guide.

## Repository Structure

```
ontology/
  rec-ontology-configured.ttl   # Generated REC 5 ontology (OWL/SHACL)
src/
  ...                           # Translation scripts (DTDL → OWL/SHACL)
docs/
  ontology-principles.pdf       # Translation methodology and design decisions
  rec5-breaking-changes.pdf     # Breaking changes and migration guide
```

## Documentation

| Document                                            | Description                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| [Ontology Principles](docs/ontology-principles.pdf) | Semantic principles, translation methodology, and configuration decisions |
| [Breaking Changes](docs/rec5-breaking-changes.pdf)  | Incompatibilities with previous REC versions and migration paths          |

## Feedback Welcome

This is a **working draft** — we actively encourage community input.

**→ Please use [GitHub Issues](../../issues) to:**

- Report problems or inconsistencies
- Suggest improvements to the model
- Discuss design decisions
- Propose new concepts or relationships

Your feedback helps shape the future of RealEstateCore.

## Related Resources

- [RealEstateCore](https://www.realestatecore.io/) — Main REC website
- [Brick Schema](https://brickschema.org/) — Partner ontology for equipment and telemetry
- [REC Consortium](https://www.realestatecore.io/consortium/) — Governance and membership

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).

---

_This repository is maintained by the REC Consortium._
