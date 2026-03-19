/**
 * The TripleHandler interface — each pipeline stage implements this.
 */
import type { TripleStore } from "../triple-store.js";
import type { ConversionContext } from "../context.js";

export interface TripleHandler {
  /** Human-readable name for logging. */
  name: string;

  /**
   * Process triples from the store and update the conversion context.
   * Handlers run in defined order — later handlers may depend on
   * data populated by earlier ones.
   */
  handle(store: TripleStore, ctx: ConversionContext): void;
}
