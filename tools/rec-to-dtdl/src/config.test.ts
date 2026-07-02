import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("loadConfig", () => {
  it("returns defaults when no file provided", () => {
    const config = loadConfig();
    expect(config.components?.detect).toBe(true);
    expect(config.components?.include).toEqual([]);
    expect(config.components?.exclude).toEqual([]);
  });

  it("loads config from a JSON file", () => {
    const dir = mkdtempSync(join(tmpdir(), "rec-test-"));
    const configPath = join(dir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        components: {
          detect: false,
          include: ["hasArea"],
          exclude: ["hasLocation"],
        },
      })
    );

    const config = loadConfig(configPath);
    expect(config.components?.detect).toBe(false);
    expect(config.components?.include).toEqual(["hasArea"]);
    expect(config.components?.exclude).toEqual(["hasLocation"]);

    rmSync(dir, { recursive: true });
  });

  it("fills defaults for missing fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "rec-test-"));
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ components: { detect: false } }));

    const config = loadConfig(configPath);
    expect(config.components?.detect).toBe(false);
    expect(config.components?.include).toEqual([]);
    expect(config.components?.exclude).toEqual([]);

    rmSync(dir, { recursive: true });
  });
});
