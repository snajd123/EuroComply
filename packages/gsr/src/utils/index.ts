// packages/gsr/src/utils/index.ts
export { sanitizeCas, isValidCasChecksum, formatCasNumber } from './cas-sanitizer.js';
export { normalizeName, sanitizeName } from './name-normalizer.js';
export { mapScopeText, getScopeKeywords } from './scope-mapper.js';
export { readXlsxFile, detectFileFormat } from './xlsx-reader.js';
export { findOrCreateSubstance, findOrCreateSubstances, type SubstanceIdentifiers, type FindOrCreateResult } from './substance-finder.js';
