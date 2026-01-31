// packages/gsr/src/clients/pubchem.types.ts

/**
 * PubChem PUG REST API response types.
 * @see https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 */

/** Response from CAS number lookup */
export interface PubChemCidResponse {
  IdentifierList?: {
    CID: number[];
  };
  Fault?: {
    Code: string;
    Message: string;
  };
}

/** Single compound property record */
export interface PubChemCompoundProperty {
  CID: number;
  MolecularFormula?: string;
  /** Note: PubChem returns this as a string, not number */
  MolecularWeight?: string | number;
  /** When requesting CanonicalSMILES, PubChem returns it as SMILES */
  SMILES?: string;
  CanonicalSMILES?: string;
  /** When requesting CanonicalSMILES, sometimes returned as ConnectivitySMILES */
  ConnectivitySMILES?: string;
  IsomericSMILES?: string;
  InChI?: string;
  InChIKey?: string;
  IUPACName?: string;
}

/** Response from compound properties lookup */
export interface PubChemPropertiesResponse {
  PropertyTable?: {
    Properties: PubChemCompoundProperty[];
  };
  Fault?: {
    Code: string;
    Message: string;
  };
}

/** Normalized enrichment data for a substance */
export interface SubstanceEnrichmentData {
  cid: number;
  smiles: string | null;
  inchiKey: string | null;
  iupacName: string | null;
  molecularWeight: number | null;
  molecularFormula: string | null;
  synonyms: string[];
}

/** Response from synonyms lookup */
export interface PubChemSynonymsResponse {
  InformationList?: {
    Information: Array<{
      CID: number;
      Synonym: string[];
    }>;
  };
  Fault?: {
    Code: string;
    Message: string;
  };
}

/** Rate limit info from PubChem headers */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}
