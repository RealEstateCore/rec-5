/**
 * Maps XSD datatypes to DTDL schema types.
 */

import { XSD } from "./namespaces.js";

const XSD_TO_DTDL: Record<string, string> = {
  [`${XSD}string`]: "string",
  [`${XSD}integer`]: "integer",
  [`${XSD}int`]: "integer",
  [`${XSD}float`]: "float",
  [`${XSD}double`]: "double",
  [`${XSD}boolean`]: "boolean",
  [`${XSD}date`]: "date",
  [`${XSD}dateTime`]: "dateTime",
  [`${XSD}duration`]: "duration",
  [`${XSD}long`]: "long",
  [`${XSD}anyURI`]: "string",
  [`${XSD}nonNegativeInteger`]: "integer",
};

export function xsdToDtdl(xsdIri: string): string | null {
  return XSD_TO_DTDL[xsdIri] ?? null;
}
