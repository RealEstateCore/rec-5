/**
 * Main orchestrator: load files → run pipeline → write output.
 */
import { TripleStore } from "./triple-store.js";
import { createContext, type ConversionContext } from "./context.js";
import { getProfile, type DtdlProfile } from "./dtdl-profile.js";
import { pipeline } from "./handlers/index.js";
import { writeOutput, writeReport } from "./writer.js";
import { REC } from "./namespaces.js";
import type { ConverterConfig } from "./config.js";

export interface ConvertOptions {
  inputFiles: string[];
  outputDir: string;
  dtdlVersion: "v2" | "v3";
  dryRun: boolean;
  verbose: boolean;
  config?: ConverterConfig;
}

export function convert(options: ConvertOptions): ConversionContext {
  const profile = getProfile(options.dtdlVersion);

  // 1. Load all Turtle files into a single triple store
  const store = new TripleStore();
  for (const file of options.inputFiles) {
    if (options.verbose) {
      console.log(`Loading: ${file}`);
    }
    store.loadFile(file);
  }

  if (options.verbose) {
    console.log(`Loaded ${store.size} triples from ${options.inputFiles.length} file(s)`);
  }

  // 2. Create the conversion context
  const ctx = createContext(profile, REC, options.config);

  // 3. Run the pipeline
  for (const handler of pipeline) {
    if (options.verbose) {
      console.log(`Running: ${handler.name}`);
    }
    handler.handle(store, ctx);
  }

  ctx.stats.warningCount = ctx.warnings.length;

  // 4. Write output (unless dry run)
  if (!options.dryRun) {
    writeOutput(options.outputDir, ctx);
    writeReport(options.outputDir, ctx);
  }

  return ctx;
}

export function printStats(ctx: ConversionContext, verbose: boolean): void {
  console.log("\n--- Conversion Summary ---");
  console.log(`  Classes found:    ${ctx.stats.classCount}`);
  console.log(`  Interfaces:       ${ctx.stats.interfaceCount}`);
  console.log(`  Relationships:    ${ctx.stats.relationshipCount}`);
  console.log(`  Properties:       ${ctx.stats.propertyCount}`);
  console.log(`  Components:       ${ctx.stats.componentCount}`);
  console.log(`  Enumerations:     ${ctx.stats.enumCount}`);
  console.log(`  Warnings:         ${ctx.stats.warningCount}`);
  console.log(`  Skipped:          ${ctx.skipped.length}`);

  if (ctx.warnings.length > 0 && verbose) {
    console.log("\n--- Warnings ---");
    for (const w of ctx.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  if (ctx.skipped.length > 0 && verbose) {
    console.log("\n--- Skipped ---");
    for (const s of ctx.skipped) {
      console.log(`  ⊘ ${s.iri}: ${s.reason}`);
    }
  }
}
