export {
  HAZARD_CLASSES,
  buildHazardClassDictionary,
  getHazardClassesByType,
  getCmrHazardClasses,
  getPictogramForHazardClass,
  type HazardClassDefinition,
} from './hazard-classes.js';

export {
  loadHStatementsFromMhchem,
  loadHStatementsForLanguage,
  EU_LANGUAGES,
  type EuLanguage,
  type MhchemHpStatementsJson,
  type HStatementWithTranslations,
  type MhchemLoadResult,
} from './mhchem-loader.js';
