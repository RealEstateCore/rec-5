#!/usr/bin/env node
/**
 * CLI entry point for rec-to-dtdl converter.
 */
import { Command } from "commander";
import { resolve } from "path";
import { convert, printStats } from "./convert.js";
import { loadConfig } from "./config.js";

const program = new Command();

program
  .name("rec-to-dtdl")
  .description("Convert REC OWL/SHACL Turtle ontology to DTDL models")
  .version("0.1.0")
  .argument("<input-files...>", "One or more Turtle (.ttl) input files")
  .requiredOption("-o, --output <dir>", "Output directory for DTDL models")
  .option("-c, --context <version>", 'DTDL context version: "v2" | "v3"', "v2")
  .option("--config <file>", "Path to converter config JSON file")
  .option("--dry-run", "Parse and report without writing files", false)
  .option("-v, --verbose", "Verbose logging", false)
  .action((inputFiles: string[], options) => {
    const resolvedFiles = inputFiles.map((f: string) => resolve(f));
    const outputDir = resolve(options.output);
    const dtdlVersion = options.context as "v2" | "v3";

    if (dtdlVersion !== "v2" && dtdlVersion !== "v3") {
      console.error(`Invalid context version: ${dtdlVersion}. Use "v2" or "v3".`);
      process.exit(1);
    }

    try {
      const config = loadConfig(
        options.config ? resolve(options.config) : undefined
      );

      const ctx = convert({
        inputFiles: resolvedFiles,
        outputDir,
        dtdlVersion,
        dryRun: options.dryRun,
        verbose: options.verbose,
        config,
      });

      printStats(ctx, options.verbose);

      if (options.dryRun) {
        console.log("\n(dry run — no files written)");
      } else {
        console.log(`\nOutput written to: ${outputDir}`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
