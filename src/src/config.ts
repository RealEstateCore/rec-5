/**
 * Converter configuration — optional settings loaded from a JSON file.
 */
import { readFileSync } from "fs";

export interface ComponentConfig {
  /** Whether to auto-detect components using heuristics. Default: true */
  detect?: boolean;
  /** Property IRIs (or local names) to always treat as components */
  include?: string[];
  /** Property IRIs (or local names) to never treat as components */
  exclude?: string[];
}

/**
 * How to handle properties that have no owning class (no SHACL shape or rdfs:domain).
 *  - "skip":   Silently skip (default, current behaviour)
 *  - "report": Skip but highlight prominently in the conversion report
 *  - "root":   Attach to every root interface (classes with no parent)
 */
export type OrphanedPropertyMode = "skip" | "report" | "root";

export interface ConverterConfig {
  components?: ComponentConfig;
  /** Strategy for properties that have no owning class. Default: "skip" */
  orphanedProperties?: OrphanedPropertyMode;
}

const DEFAULT_CONFIG: ConverterConfig = {
  components: {
    detect: true,
    include: [],
    exclude: [],
  },
  orphanedProperties: "skip",
};

export function loadConfig(filePath?: string): ConverterConfig {
  if (!filePath) return DEFAULT_CONFIG;

  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ConverterConfig>;

  return {
    components: {
      detect: parsed.components?.detect ?? true,
      include: parsed.components?.include ?? [],
      exclude: parsed.components?.exclude ?? [],
    },
    orphanedProperties: parsed.orphanedProperties ?? "skip",
  };
}
