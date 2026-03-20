import { describe, it, expect } from "vitest";
import { createContext, type ConversionContext } from "../context.js";
import { getProfile } from "../dtdl-profile.js";
import { REC } from "../namespaces.js";
import { ComponentHandler } from "./component.js";
import { TripleStore } from "../triple-store.js";
import type { ConverterConfig } from "../config.js";

function makeCtx(config?: ConverterConfig): ConversionContext {
  return createContext(getProfile("v2"), REC, config);
}

function setupComponentScenario(ctx: ConversionContext): void {
  // Register classes: Space (parent) and Area (leaf value type)
  ctx.classHierarchy.set(REC + "Space", null);
  ctx.classHierarchy.set(REC + "Area", null);

  // Area interface (the value-type)
  ctx.interfaces.set(REC + "Area", {
    "@id": "dtmi:org:w3id:rec:Area;1",
    "@type": "Interface",
    "@context": "dtmi:dtdl:context;2",
    contents: [],
  });

  // Space interface (the owner)
  ctx.interfaces.set(REC + "Space", {
    "@id": "dtmi:org:w3id:rec:Space;1",
    "@type": "Interface",
    "@context": "dtmi:dtdl:context;2",
    contents: [
      {
        "@type": "Relationship",
        name: "hasArea",
      },
    ],
  });

  // Object property: hasArea
  ctx.propertyDefinitions.set(REC + "hasArea", {
    iri: REC + "hasArea",
    localName: "hasArea",
    kind: "object",
    labels: { en: "hasArea" },
    comments: {},
    range: REC + "Area",
    characteristics: [],
  });

  // Shape constraining hasArea with maxCount 1
  const shapeIri = REC + "hasAreaShape";
  ctx.shapeDefinitions.set(shapeIri, {
    iri: shapeIri,
    path: REC + "hasArea",
    targetClasses: [REC + "Area"],
    maxCount: 1,
  });
  ctx.shapesByPath.set(REC + "hasArea", [ctx.shapeDefinitions.get(shapeIri)!]);

  // Link shape to Space class
  ctx.classProperties.set(REC + "Space", [shapeIri]);
  ctx.classProperties.set(REC + "Area", []);
}

describe("ComponentHandler", () => {
  it("uses property localName as-is for component name (no has-stripping)", () => {
    const ctx = makeCtx();
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);

    const spaceIface = ctx.interfaces.get(REC + "Space")!;
    const component = spaceIface.contents!.find(
      (c) => c["@type"] === "Component"
    );
    expect(component).toBeDefined();
    expect(component!.name).toBe("hasArea");
  });

  it("detects components by heuristic when detect=true (default)", () => {
    const ctx = makeCtx();
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);
    expect(ctx.stats.componentCount).toBe(1);
  });

  it("skips heuristic detection when detect=false", () => {
    const ctx = makeCtx({
      components: { detect: false, include: [], exclude: [] },
    });
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);
    expect(ctx.stats.componentCount).toBe(0);

    // Relationship should remain
    const spaceIface = ctx.interfaces.get(REC + "Space")!;
    const rel = spaceIface.contents!.find(
      (c) => c["@type"] === "Relationship"
    );
    expect(rel).toBeDefined();
  });

  it("force-includes a property as component even when detect=false", () => {
    const ctx = makeCtx({
      components: { detect: false, include: ["hasArea"], exclude: [] },
    });
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);
    expect(ctx.stats.componentCount).toBe(1);
  });

  it("excludes a property from component detection", () => {
    const ctx = makeCtx({
      components: { detect: true, include: [], exclude: ["hasArea"] },
    });
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);
    expect(ctx.stats.componentCount).toBe(0);
  });

  it("uses ontology labels faithfully for displayName", () => {
    const ctx = makeCtx();
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);

    const spaceIface = ctx.interfaces.get(REC + "Space")!;
    const component = spaceIface.contents!.find(
      (c) => c["@type"] === "Component"
    );
    expect(component).toBeDefined();
    expect((component as any).displayName).toEqual({ en: "hasArea" });
  });

  it("removes the corresponding relationship when promoting to component", () => {
    const ctx = makeCtx();
    setupComponentScenario(ctx);

    ComponentHandler.handle(new TripleStore(), ctx);

    const spaceIface = ctx.interfaces.get(REC + "Space")!;
    const rels = spaceIface.contents!.filter(
      (c) => c["@type"] === "Relationship"
    );
    expect(rels.length).toBe(0);
  });
});
