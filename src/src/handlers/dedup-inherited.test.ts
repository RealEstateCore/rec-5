import { describe, it, expect } from "vitest";
import { createContext, type ConversionContext } from "../context.js";
import { getProfile } from "../dtdl-profile.js";
import { REC } from "../namespaces.js";
import { DedupInheritedHandler } from "./dedup-inherited.js";
import { TripleStore } from "../triple-store.js";

const BRICK = "https://brickschema.org/schema/Brick#";

function makeCtx(): ConversionContext {
  return createContext(getProfile("v2"), REC);
}

describe("DedupInheritedHandler", () => {
  it("removes child contents that duplicate a parent content name", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(BRICK + "Equipment", null);
    ctx.classHierarchy.set(BRICK + "HVAC_Equipment", BRICK + "Equipment");

    ctx.interfaces.set(BRICK + "Equipment", {
      "@id": "dtmi:org:brickschema:schema:Brick:Equipment;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Relationship", name: "feeds" },
        { "@type": "Relationship", name: "hasPart" },
      ],
    });

    ctx.interfaces.set(BRICK + "HVAC_Equipment", {
      "@id": "dtmi:org:brickschema:schema:Brick:HVAC_Equipment;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      extends: "dtmi:org:brickschema:schema:Brick:Equipment;1",
      contents: [
        { "@type": "Relationship", name: "feeds" },
        { "@type": "Relationship", name: "hasPart" },
        { "@type": "Relationship", name: "hasLocation" },
      ],
    });

    DedupInheritedHandler.handle(new TripleStore(), ctx);

    const hvac = ctx.interfaces.get(BRICK + "HVAC_Equipment")!;
    expect(hvac.contents).toHaveLength(1);
    expect(hvac.contents![0].name).toBe("hasLocation");
    expect(ctx.stats.dedupCount).toBe(2);
  });

  it("does not remove contents from root interfaces", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(BRICK + "Equipment", null);
    ctx.interfaces.set(BRICK + "Equipment", {
      "@id": "dtmi:org:brickschema:schema:Brick:Equipment;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Relationship", name: "feeds" },
        { "@type": "Relationship", name: "hasPart" },
      ],
    });

    DedupInheritedHandler.handle(new TripleStore(), ctx);

    const equip = ctx.interfaces.get(BRICK + "Equipment")!;
    expect(equip.contents).toHaveLength(2);
    expect(ctx.stats.dedupCount).toBe(0);
  });

  it("walks the full ancestor chain (grandparent)", () => {
    const ctx = makeCtx();

    ctx.classHierarchy.set(BRICK + "Equipment", null);
    ctx.classHierarchy.set(BRICK + "HVAC_Equipment", BRICK + "Equipment");
    ctx.classHierarchy.set(BRICK + "AHU", BRICK + "HVAC_Equipment");

    ctx.interfaces.set(BRICK + "Equipment", {
      "@id": "dtmi:org:brickschema:schema:Brick:Equipment;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      contents: [
        { "@type": "Relationship", name: "feeds" },
      ],
    });

    ctx.interfaces.set(BRICK + "HVAC_Equipment", {
      "@id": "dtmi:org:brickschema:schema:Brick:HVAC_Equipment;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      extends: "dtmi:org:brickschema:schema:Brick:Equipment;1",
      contents: [
        { "@type": "Relationship", name: "hasLocation" },
      ],
    });

    ctx.interfaces.set(BRICK + "AHU", {
      "@id": "dtmi:org:brickschema:schema:Brick:AHU;1",
      "@type": "Interface",
      "@context": "dtmi:dtdl:context;2",
      extends: "dtmi:org:brickschema:schema:Brick:HVAC_Equipment;1",
      contents: [
        { "@type": "Relationship", name: "feeds" },
        { "@type": "Relationship", name: "hasLocation" },
        { "@type": "Property", name: "efficiency", schema: "double" },
      ],
    });

    DedupInheritedHandler.handle(new TripleStore(), ctx);

    const ahu = ctx.interfaces.get(BRICK + "AHU")!;
    expect(ahu.contents).toHaveLength(1);
    expect(ahu.contents![0].name).toBe("efficiency");
    expect(ctx.stats.dedupCount).toBe(2);
  });
});
