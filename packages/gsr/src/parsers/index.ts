// packages/gsr/src/parsers/index.ts

export { EchaInventoryParser } from './echa-inventory.parser.js';
export type { EchaInventoryRecord, EchaRawRow } from './echa-inventory.parser.js';

export { EchaSvhcParser } from './echa-svhc.parser.js';
export type { EchaSvhcRecord, EchaSvhcRawRow } from './echa-svhc.parser.js';

export { ClpClassificationParser } from './clp-classification.parser.js';
export type { ParsedClassification } from './clp-classification.parser.js';

export { parseComptoxRow } from './comptox.parser.js';
export type { ComptoxRow, ParsedComptoxSubstance } from './comptox.parser.js';

export {
  parseCosingAnnexII,
  parseCosingAnnexIII,
  parseCosingAnnexIV,
  parseCosingAnnexV,
  parseCosingAnnexVI,
} from './cosing.parser.js';
export type {
  CosingAnnexIIRow,
  CosingAnnexIIIRow,
  CosingAnnexIVRow,
  CosingAnnexVRow,
  CosingAnnexVIRow,
  ParsedCosingEntry,
} from './cosing.parser.js';

export {
  parseENumberLine,
  parseOpenFoodToxRow,
  normalizeENumber,
} from './efsa.parser.js';
export type {
  ParsedENumber,
  ParsedOpenFoodToxEntry,
  OpenFoodToxRow,
} from './efsa.parser.js';

export { parseTscaRow } from './tsca.parser.js';
export type { TscaRow, ParsedTscaEntry } from './tsca.parser.js';

export { parseBiocidesRow } from './biocides.parser.js';
export type { BiocidesRow, ParsedBiocidesEntry } from './biocides.parser.js';
