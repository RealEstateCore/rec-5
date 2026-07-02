/**
 * DTDL version abstraction — isolates version-specific behavior.
 */

export interface DtdlProfile {
  version: "v2" | "v3";
  contextUrl: string;
  supportsMinMultiplicity: boolean;
  supportsPropertyWritable: boolean;
  maxExtendsCount: number;
}

export const DTDL_V2: DtdlProfile = {
  version: "v2",
  contextUrl: "dtmi:dtdl:context;2",
  supportsMinMultiplicity: false,
  supportsPropertyWritable: false,
  maxExtendsCount: 2,
};

export const DTDL_V3: DtdlProfile = {
  version: "v3",
  contextUrl: "dtmi:dtdl:context;3",
  supportsMinMultiplicity: true,
  supportsPropertyWritable: true,
  maxExtendsCount: 1024,
};

export function getProfile(version: "v2" | "v3"): DtdlProfile {
  return version === "v3" ? DTDL_V3 : DTDL_V2;
}
