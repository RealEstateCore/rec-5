/**
 * TypeScript types for DTDL v2/v3 model structures.
 */

export interface LocalizedString {
  [lang: string]: string;
}

export interface DTDLInterface {
  "@id": string;
  "@type": "Interface";
  "@context": string;
  displayName?: LocalizedString;
  description?: LocalizedString;
  comment?: string;
  extends?: string | string[];
  contents?: DTDLContent[];
}

export type DTDLContent = DTDLRelationship | DTDLProperty | DTDLComponent;

export interface DTDLRelationship {
  "@type": "Relationship";
  name: string;
  displayName?: LocalizedString;
  description?: LocalizedString;
  comment?: string;
  target?: string;
  maxMultiplicity?: number;
  minMultiplicity?: number;
}

export interface DTDLProperty {
  "@type": "Property";
  name: string;
  schema: DTDLSchema;
  displayName?: LocalizedString;
  description?: LocalizedString;
  comment?: string;
  writable?: boolean;
}

export interface DTDLComponent {
  "@type": "Component";
  name: string;
  schema: string;
  displayName?: LocalizedString;
  description?: LocalizedString;
}

export type DTDLSchema = string | DTDLEnum | DTDLObject | DTDLMap;

export interface DTDLEnum {
  "@type": "Enum";
  valueSchema: string;
  enumValues: DTDLEnumValue[];
}

export interface DTDLEnumValue {
  name: string;
  enumValue: string | number;
  displayName?: LocalizedString;
}

export interface DTDLObject {
  "@type": "Object";
  fields: DTDLObjectField[];
}

export interface DTDLObjectField {
  name: string;
  schema: string;
  displayName?: LocalizedString;
}

export interface DTDLMap {
  "@type": "Map";
  mapKey: { name: string; schema: string };
  mapValue: { name: string; schema: string };
}
