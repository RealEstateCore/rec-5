/**
 * Thin wrapper around N3.Store with convenience query helpers.
 */
import { Store, Parser, Quad, NamedNode, Term, DataFactory } from "n3";
import { readFileSync } from "fs";
import { RDF_FIRST, RDF_REST, RDF_NIL } from "./namespaces.js";

export class TripleStore {
  readonly store: Store;

  constructor() {
    this.store = new Store();
  }

  /** Load a Turtle file into the store. */
  loadFile(filePath: string): void {
    const content = readFileSync(filePath, "utf-8");
    const parser = new Parser();
    const quads = parser.parse(content);
    this.store.addQuads(quads);
  }

  /** Match triples with optional wildcards (null = any). */
  match(
    subject: Term | null,
    predicate: Term | null,
    object: Term | null
  ): Quad[] {
    return this.store.getQuads(subject, predicate, object, null);
  }

  /** Get all objects for a given subject and predicate. */
  objects(subject: Term, predicate: Term): Term[] {
    return this.match(subject, predicate, null).map((q) => q.object);
  }

  /** Get the first object for a given subject and predicate, or null. */
  object(subject: Term, predicate: Term): Term | null {
    const quads = this.match(subject, predicate, null);
    return quads.length > 0 ? quads[0].object : null;
  }

  /** Get all subjects that have a given predicate and object. */
  subjects(predicate: Term, object: Term): Term[] {
    return this.match(null, predicate, object).map((q) => q.subject);
  }

  /** Get localized labels as a map of lang → value. */
  labels(subject: Term, predicate: Term): Record<string, string> {
    const result: Record<string, string> = {};
    for (const quad of this.match(subject, predicate, null)) {
      const obj = quad.object;
      if ("language" in obj && obj.language) {
        result[obj.language] = obj.value;
      } else {
        result["en"] = obj.value;
      }
    }
    return result;
  }

  /** Resolve an RDF list (rdf:first/rdf:rest chain) to an array of terms. */
  resolveList(head: Term): Term[] {
    const items: Term[] = [];
    let current: Term | null = head;
    while (current && current.value !== RDF_NIL.value) {
      const first = this.object(current, RDF_FIRST);
      if (first) items.push(first);
      current = this.object(current, RDF_REST);
    }
    return items;
  }

  /** Total number of quads in the store. */
  get size(): number {
    return this.store.size;
  }
}
