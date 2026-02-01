import { HazardType, SignalWord } from '../entities/HazardClass.js';

/**
 * Definition of a CLP/GHS hazard class for reference data seeding.
 */
export interface HazardClassDefinition {
  /** Standard CLP abbreviation */
  code: string;
  /** Full name of the hazard class */
  fullName: string;
  /** Type of hazard */
  hazardType: HazardType;
  /** GHS pictogram code (optional) */
  pictogram?: string;
  /** Signal word (optional) */
  signalWord?: SignalWord;
  /** Is this a CMR (Carcinogenic, Mutagenic, Reprotoxic) hazard class */
  isCmr: boolean;
}

/**
 * Complete list of CLP/GHS hazard classes per Regulation (EC) No 1272/2008.
 *
 * Organized by:
 * - Physical hazards (Part 2 of Annex I)
 * - Health hazards (Part 3 of Annex I)
 * - Environmental hazards (Part 4 of Annex I)
 *
 * Reference: ECHA CLP Regulation, Annex I
 * https://echa.europa.eu/regulations/clp/legislation
 */
export const HAZARD_CLASSES: HazardClassDefinition[] = [
  // ============================================================================
  // PHYSICAL HAZARDS (Part 2 of Annex I)
  // ============================================================================

  // 2.1 Explosives
  {
    code: 'Expl.',
    fullName: 'Explosives',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS01',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.2 Flammable gases
  {
    code: 'Flam. Gas',
    fullName: 'Flammable Gases',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.3 Aerosols
  {
    code: 'Aerosol',
    fullName: 'Aerosols',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.4 Oxidising gases
  {
    code: 'Ox. Gas',
    fullName: 'Oxidising Gases',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS03',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.5 Gases under pressure
  {
    code: 'Press. Gas',
    fullName: 'Gases Under Pressure',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS04',
    // No signal word for gases under pressure
    isCmr: false,
  },

  // 2.6 Flammable liquids
  {
    code: 'Flam. Liq.',
    fullName: 'Flammable Liquids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.7 Flammable solids
  {
    code: 'Flam. Sol.',
    fullName: 'Flammable Solids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.8 Self-reactive substances and mixtures
  {
    code: 'Self-react.',
    fullName: 'Self-Reactive Substances and Mixtures',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS01',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.9 Pyrophoric liquids
  {
    code: 'Pyr. Liq.',
    fullName: 'Pyrophoric Liquids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.10 Pyrophoric solids
  {
    code: 'Pyr. Sol.',
    fullName: 'Pyrophoric Solids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.11 Self-heating substances and mixtures
  {
    code: 'Self-heat.',
    fullName: 'Self-Heating Substances and Mixtures',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.12 Substances and mixtures which in contact with water emit flammable gases
  {
    code: 'Water-react.',
    fullName: 'Substances and Mixtures Which in Contact with Water Emit Flammable Gases',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS02',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.13 Oxidising liquids
  {
    code: 'Ox. Liq.',
    fullName: 'Oxidising Liquids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS03',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.14 Oxidising solids
  {
    code: 'Ox. Sol.',
    fullName: 'Oxidising Solids',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS03',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.15 Organic peroxides
  {
    code: 'Org. Perox.',
    fullName: 'Organic Peroxides',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS01',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 2.16 Corrosive to metals
  {
    code: 'Met. Corr.',
    fullName: 'Corrosive to Metals',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS05',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },

  // 2.17 Desensitised explosives (added in 8th ATP)
  {
    code: 'Desens. Expl.',
    fullName: 'Desensitised Explosives',
    hazardType: HazardType.PHYSICAL,
    pictogram: 'GHS01',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // ============================================================================
  // HEALTH HAZARDS (Part 3 of Annex I)
  // ============================================================================

  // 3.1 Acute toxicity
  {
    code: 'Acute Tox.',
    fullName: 'Acute Toxicity',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS06',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 3.2 Skin corrosion/irritation
  {
    code: 'Skin Corr.',
    fullName: 'Skin Corrosion',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS05',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },
  {
    code: 'Skin Irrit.',
    fullName: 'Skin Irritation',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS07',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },

  // 3.3 Serious eye damage/eye irritation
  {
    code: 'Eye Dam.',
    fullName: 'Serious Eye Damage',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS05',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },
  {
    code: 'Eye Irrit.',
    fullName: 'Eye Irritation',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS07',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },

  // 3.4 Respiratory or skin sensitisation
  {
    code: 'Resp. Sens.',
    fullName: 'Respiratory Sensitisation',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },
  {
    code: 'Skin Sens.',
    fullName: 'Skin Sensitisation',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS07',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },

  // 3.5 Germ cell mutagenicity (CMR)
  {
    code: 'Muta.',
    fullName: 'Germ Cell Mutagenicity',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: true,
  },

  // 3.6 Carcinogenicity (CMR)
  {
    code: 'Carc.',
    fullName: 'Carcinogenicity',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: true,
  },

  // 3.7 Reproductive toxicity (CMR)
  {
    code: 'Repr.',
    fullName: 'Reproductive Toxicity',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: true,
  },

  // 3.8 Specific target organ toxicity - single exposure
  {
    code: 'STOT SE',
    fullName: 'Specific Target Organ Toxicity - Single Exposure',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 3.9 Specific target organ toxicity - repeated exposure
  {
    code: 'STOT RE',
    fullName: 'Specific Target Organ Toxicity - Repeated Exposure',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // 3.10 Aspiration hazard
  {
    code: 'Asp. Tox.',
    fullName: 'Aspiration Hazard',
    hazardType: HazardType.HEALTH,
    pictogram: 'GHS08',
    signalWord: SignalWord.DANGER,
    isCmr: false,
  },

  // ============================================================================
  // ENVIRONMENTAL HAZARDS (Part 4 of Annex I)
  // ============================================================================

  // 4.1 Hazardous to the aquatic environment
  {
    code: 'Aquatic Acute',
    fullName: 'Hazardous to the Aquatic Environment - Acute Hazard',
    hazardType: HazardType.ENVIRONMENTAL,
    pictogram: 'GHS09',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },
  {
    code: 'Aquatic Chronic',
    fullName: 'Hazardous to the Aquatic Environment - Chronic Hazard',
    hazardType: HazardType.ENVIRONMENTAL,
    pictogram: 'GHS09',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },

  // 4.2 Hazardous to the ozone layer
  {
    code: 'Ozone',
    fullName: 'Hazardous to the Ozone Layer',
    hazardType: HazardType.ENVIRONMENTAL,
    pictogram: 'GHS07',
    signalWord: SignalWord.WARNING,
    isCmr: false,
  },
];

/**
 * Builds a dictionary (Map) of hazard class definitions keyed by code.
 * Useful for O(1) lookups during classification parsing.
 *
 * @returns Map of hazard class code to definition
 */
export function buildHazardClassDictionary(): Map<string, HazardClassDefinition> {
  const map = new Map<string, HazardClassDefinition>();
  for (const hc of HAZARD_CLASSES) {
    map.set(hc.code, hc);
  }
  return map;
}

/**
 * Gets all hazard classes of a specific type.
 *
 * @param hazardType - The type of hazard to filter by
 * @returns Array of hazard class definitions
 */
export function getHazardClassesByType(hazardType: HazardType): HazardClassDefinition[] {
  return HAZARD_CLASSES.filter(hc => hc.hazardType === hazardType);
}

/**
 * Gets all CMR (Carcinogenic, Mutagenic, Reprotoxic) hazard classes.
 *
 * @returns Array of CMR hazard class definitions
 */
export function getCmrHazardClasses(): HazardClassDefinition[] {
  return HAZARD_CLASSES.filter(hc => hc.isCmr);
}

/**
 * Gets the pictogram codes for a given hazard class code.
 *
 * @param code - The hazard class code (e.g., "Carc.")
 * @returns The pictogram code (e.g., "GHS08") or undefined if not found/no pictogram
 */
export function getPictogramForHazardClass(code: string): string | undefined {
  const hc = HAZARD_CLASSES.find(h => h.code === code);
  return hc?.pictogram;
}
