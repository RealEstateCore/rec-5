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

export interface ConverterConfig {
  components?: ComponentConfig;
}

const DEFAULT_CONFIG: ConverterConfig = {
  components: {
    detect: true,
    include: [],
    exclude: [],
  },
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
  };
}
