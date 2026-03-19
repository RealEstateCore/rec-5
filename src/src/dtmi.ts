/**
 * Convert OWL IRIs to DTDL DTMIs (Digital Twin Model Identifiers).
 *
 * Example:
 *   http://w3id.org/rec#Space  →  dtmi:org:w3id:rec:Space;1
 *   https://brickschema.org/schema/Brick#Point  →  dtmi:org:brickschema:schema:Brick:Point;1
 */

const NAMESPACE_MAP: Record<string, string> = {
  "http://w3id.org/rec#": "dtmi:org:w3id:rec",
  "https://brickschema.org/schema/Brick#": "dtmi:org:brickschema:schema:Brick",
};

export function iriToDtmi(iri: string, version: number = 1): string {
  for (const [ns, dtmiBase] of Object.entries(NAMESPACE_MAP)) {
    if (iri.startsWith(ns)) {
      const localName = iri.slice(ns.length);
      return `${dtmiBase}:${localName};${version}`;
    }
  }

  // Fallback: derive from IRI structure
  const hashIdx = iri.lastIndexOf("#");
  const slashIdx = iri.lastIndexOf("/");
  const splitIdx = hashIdx >= 0 ? hashIdx : slashIdx;

  if (splitIdx < 0) {
    return `dtmi:unknown:${iri};${version}`;
  }

  const namespace = iri.slice(0, splitIdx + 1);
  const localName = iri.slice(splitIdx + 1);

  // Convert namespace to DTMI segments
  const segments = namespace
    .replace(/^https?:\/\//, "")
    .replace(/[#/]$/, "")
    .split(/[./]/)
    .reverse()
    .join(":");

  return `dtmi:${segments}:${localName};${version}`;
}

/** Extract the local name from an IRI (part after # or last /). */
export function localName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx >= 0) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  if (slashIdx >= 0) return iri.slice(slashIdx + 1);
  return iri;
}
