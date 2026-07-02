/**
 * Convert OWL IRIs to DTDL DTMIs (Digital Twin Model Identifiers).
 *
 * DTMI format (per DTDL spec):
 *   dtmi:<path>;<version>
 *
 * Path rules:
 *   - Colon-separated segments
 *   - Each segment: [a-zA-Z_][a-zA-Z0-9_]*, must not end with underscore
 *   - Max 128 chars for Interface @id
 *
 * Convention for IRI → DTMI:
 *   Reverse the domain, then append the path segments.
 *   http://w3id.org/rec#Space  →  dtmi:org:w3id:rec:Space;1
 */

const NAMESPACE_MAP: Record<string, string> = {
  "http://w3id.org/rec#": "dtmi:org:w3id:rec",
  "https://brickschema.org/schema/Brick#": "dtmi:org:brickschema:schema:Brick",
};

/**
 * Sanitize a string segment to be a valid DTMI path segment.
 * - Only letters, digits, underscores allowed
 * - Must not start with a digit
 * - Must not end with an underscore
 */
function sanitizeSegment(s: string): string {
  // Replace invalid chars with underscore
  let sanitized = s.replace(/[^a-zA-Z0-9_]/g, "_");
  // Ensure it doesn't start with a digit
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  // Trim trailing underscores
  sanitized = sanitized.replace(/_+$/, "");
  // If empty after sanitization, use a placeholder
  if (!sanitized) return "x";
  return sanitized;
}

export function iriToDtmi(iri: string, version: number = 1): string {
  // Check known namespace mappings first
  for (const [ns, dtmiBase] of Object.entries(NAMESPACE_MAP)) {
    if (iri.startsWith(ns)) {
      const name = iri.slice(ns.length);
      const safeName = sanitizeSegment(name);
      return `${dtmiBase}:${safeName};${version}`;
    }
  }

  // Fallback: derive from IRI structure
  const hashIdx = iri.lastIndexOf("#");
  const slashIdx = iri.lastIndexOf("/");
  const splitIdx = hashIdx >= 0 ? hashIdx : slashIdx;

  if (splitIdx < 0) {
    return `dtmi:unknown:${sanitizeSegment(iri)};${version}`;
  }

  const namespace = iri.slice(0, splitIdx + 1);
  const name = iri.slice(splitIdx + 1);

  // Convert namespace: strip protocol, split on . and /, reverse domain part
  const withoutProtocol = namespace
    .replace(/^https?:\/\//, "")
    .replace(/[#/]$/, "");

  // Split into domain and path parts
  const firstSlash = withoutProtocol.indexOf("/");
  let segments: string[];

  if (firstSlash >= 0) {
    const domain = withoutProtocol.slice(0, firstSlash);
    const path = withoutProtocol.slice(firstSlash + 1);

    // Reverse domain segments (w3id.org → org:w3id), keep path order
    const domainParts = domain.split(".").reverse();
    const pathParts = path.split("/").filter(Boolean);
    segments = [...domainParts, ...pathParts];
  } else {
    // Only domain, no path
    segments = withoutProtocol.split(".").reverse();
  }

  const safeSegments = segments.map(sanitizeSegment).filter(Boolean);
  const safeName = sanitizeSegment(name);

  return `dtmi:${safeSegments.join(":")}:${safeName};${version}`;
}

/** Extract the local name from an IRI (part after # or last /). */
export function localName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx >= 0) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  if (slashIdx >= 0) return iri.slice(slashIdx + 1);
  return iri;
}
