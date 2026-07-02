import { describe, it, expect } from "vitest";
import { createContext, type ConversionContext } from "../context.js";
import { getProfile } from "../dtdl-profile.js";
import { REC } from "../namespaces.js";
import { EnumerationHandler } from "./enumeration.js";
import { TripleStore } from "../triple-store.js";
import type { DTDLProperty, DTDLEnum } from "../dtdl-types.js";

const BRICK = "https://brickschema.org/schema/Brick#";
const QUDT = "http://qudt.org/vocab/unit/";

function makeCtx(): ConversionContext {
  return createContext(getProfile("v2"), REC);
}

describe("EnumerationHandler", () => {
  it("sanitizes full URIs into valid DTDL enum value names", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(BRICK + "TempShape", null);
    ctx.interfaces.set(BRICK + "TempShape", {
      "@id": "dtmi:org:brickschema:schema:Brick:TempShape;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Property", name: "hasUnit", schema: "string" },
      ],
    });

    const shapeIri = BRICK + "tempUnitShape";
    ctx.shapeDefinitions.set(shapeIri, {
      iri: shapeIri,
      path: BRICK + "hasUnit",
      targetClasses: [],
      inValues: [
        QUDT + "DEG_C",
        QUDT + "DEG_F",
        QUDT + "K",
      ],
    });
    ctx.classProperties.set(BRICK + "TempShape", [shapeIri]);

    EnumerationHandler.handle(new TripleStore(), ctx);

    const prop = ctx.interfaces.get(BRICK + "TempShape")!
      .contents!.find((c) => c.name === "hasUnit") as DTDLProperty;
    const schema = prop.schema as DTDLEnum;

    expect(schema["@type"]).toBe("Enum");
    expect(schema.enumValues).toHaveLength(3);
    expect(schema.enumValues[0].name).toBe("DEG_C");
    expect(schema.enumValues[0].enumValue).toBe(QUDT + "DEG_C");
    expect(schema.enumValues[1].name).toBe("DEG_F");
    expect(schema.enumValues[2].name).toBe("K");
  });

  it("deduplicates enum names when local names collide", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(REC + "TestClass", null);
    ctx.interfaces.set(REC + "TestClass", {
      "@id": "dtmi:org:w3id:rec:TestClass;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Property", name: "status", schema: "string" },
      ],
    });

    const shapeIri = REC + "statusShape";
    ctx.shapeDefinitions.set(shapeIri, {
      iri: shapeIri,
      path: REC + "status",
      targetClasses: [],
      inValues: [
        "http://example.org/ns1#Active",
        "http://example.org/ns2#Active",
        "http://example.org/ns3#Active",
      ],
    });
    ctx.classProperties.set(REC + "TestClass", [shapeIri]);

    EnumerationHandler.handle(new TripleStore(), ctx);

    const prop = ctx.interfaces.get(REC + "TestClass")!
      .contents!.find((c) => c.name === "status") as DTDLProperty;
    const schema = prop.schema as DTDLEnum;

    expect(schema.enumValues[0].name).toBe("Active");
    expect(schema.enumValues[1].name).toBe("Active_2");
    expect(schema.enumValues[2].name).toBe("Active_3");
  });

  it("replaces Relationship with Enum Property when names collide", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(BRICK + "EnergyShape", null);
    ctx.interfaces.set(BRICK + "EnergyShape", {
      "@id": "dtmi:org:brickschema:schema:Brick:EnergyShape;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        {
          "@type": "Relationship",
          name: "hasUnit",
          displayName: { en: "Has unit" },
          maxMultiplicity: 1,
        },
      ],
    });

    const shapeIri = BRICK + "energyUnitShape";
    ctx.shapeDefinitions.set(shapeIri, {
      iri: shapeIri,
      path: BRICK + "hasUnit",
      targetClasses: [QUDT + "Unit"],
      inValues: [QUDT + "W_HR", QUDT + "KiloW_HR"],
    });
    ctx.classProperties.set(BRICK + "EnergyShape", [shapeIri]);

    EnumerationHandler.handle(new TripleStore(), ctx);

    const iface = ctx.interfaces.get(BRICK + "EnergyShape")!;
    const rels = iface.contents!.filter((c) => c["@type"] === "Relationship");
    const props = iface.contents!.filter((c) => c["@type"] === "Property");

    expect(rels).toHaveLength(0);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("hasUnit");
    expect((props[0] as DTDLProperty).schema).toHaveProperty("@type", "Enum");
  });

  it("handles enum values that are plain strings (not URIs)", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(REC + "Alarm", null);
    ctx.interfaces.set(REC + "Alarm", {
      "@id": "dtmi:org:w3id:rec:Alarm;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Property", name: "severity", schema: "string" },
      ],
    });

    const shapeIri = REC + "severityShape";
    ctx.shapeDefinitions.set(shapeIri, {
      iri: shapeIri,
      path: REC + "severity",
      targetClasses: [],
      inValues: ["Critical", "Warning", "Info"],
    });
    ctx.classProperties.set(REC + "Alarm", [shapeIri]);

    EnumerationHandler.handle(new TripleStore(), ctx);

    const prop = ctx.interfaces.get(REC + "Alarm")!
      .contents!.find((c) => c.name === "severity") as DTDLProperty;
    const schema = prop.schema as DTDLEnum;

    expect(schema.enumValues[0].name).toBe("Critical");
    expect(schema.enumValues[0].enumValue).toBe("Critical");
    expect(schema.enumValues[1].name).toBe("Warning");
    expect(schema.enumValues[2].name).toBe("Info");
  });

  it("sanitizes names starting with digits", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(REC + "Test", null);
    ctx.interfaces.set(REC + "Test", {
      "@id": "dtmi:org:w3id:rec:Test;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Property", name: "code", schema: "string" },
      ],
    });

    const shapeIri = REC + "codeShape";
    ctx.shapeDefinitions.set(shapeIri, {
      iri: shapeIri,
      path: REC + "code",
      targetClasses: [],
      inValues: ["http://example.org/codes#3phase", "http://example.org/codes#single"],
    });
    ctx.classProperties.set(REC + "Test", [shapeIri]);

    EnumerationHandler.handle(new TripleStore(), ctx);

    const prop = ctx.interfaces.get(REC + "Test")!
      .contents!.find((c) => c.name === "code") as DTDLProperty;
    const schema = prop.schema as DTDLEnum;

    expect(schema.enumValues[0].name).toBe("_3phase");
    expect(schema.enumValues[1].name).toBe("single");
  });
});
