// packages/gsr/src/cli/full-validate.ts
/**
 * Comprehensive Data Integrity Validation
 *
 * This validates the ENTIRE database against source data files.
 * NO spot-checks, NO shortcuts - every record is verified.
 */
import type { MikroORM } from '@mikro-orm/postgresql';
import { initOrm, closeOrm, Substance, isValidCasNumber } from '@eurocomply/database';
import { HazardClass } from '../entities/HazardClass.js';
import { HazardStatement } from '../entities/HazardStatement.js';
import { SubstanceHazardClassification } from '../entities/SubstanceHazardClassification.js';
import { gsrEntities } from '../entities/index.js';
import { readXlsxFile } from '../utils/index.js';
import { ClpClassificationParser } from '../parsers/clp-classification.parser.js';
import { HAZARD_CLASSES } from '../reference-data/hazard-classes.js';
import { HAZARD_STATEMENTS as H_STATEMENTS } from '../seeders/hazard-reference.seeder.js';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationReport {
  timestamp: string;
  duration: number;
  sections: ValidationSection[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

interface ValidationSection {
  name: string;
  description: string;
  checks: ValidationCheck[];
  passed: boolean;
}

interface ValidationCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected?: string | number;
  actual?: string | number;
  details?: string[];
  sampleErrors?: string[];
}

let orm: MikroORM | null = null;

async function getOrm(): Promise<MikroORM> {
  if (!orm) {
    orm = await initOrm({ additionalEntities: gsrEntities });
  }
  return orm;
}

async function cleanupOrm(): Promise<void> {
  if (orm) {
    await closeOrm();
    orm = null;
  }
}

/**
 * Section 1: Hazard Class Reference Data Validation
 */
async function validateHazardClasses(em: ReturnType<MikroORM['em']['fork']>): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // 1.1 Count validation
  const dbClasses = await em.find(HazardClass, {});
  const expectedClasses = HAZARD_CLASSES;

  checks.push({
    name: 'Hazard class count',
    status: dbClasses.length === expectedClasses.length ? 'PASS' : 'FAIL',
    expected: expectedClasses.length,
    actual: dbClasses.length,
  });

  // 1.2 Every expected class exists in DB
  const dbClassCodes = new Set(dbClasses.map(c => c.code));
  const missingClasses: string[] = [];
  const extraClasses: string[] = [];

  for (const expected of expectedClasses) {
    if (!dbClassCodes.has(expected.code)) {
      missingClasses.push(expected.code);
    }
  }

  const expectedCodes = new Set(expectedClasses.map(c => c.code));
  for (const dbClass of dbClasses) {
    if (!expectedCodes.has(dbClass.code)) {
      extraClasses.push(dbClass.code);
    }
  }

  checks.push({
    name: 'All expected hazard classes present',
    status: missingClasses.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: missingClasses.length,
    sampleErrors: missingClasses.slice(0, 10),
  });

  checks.push({
    name: 'No unexpected hazard classes',
    status: extraClasses.length === 0 ? 'PASS' : 'WARN',
    expected: 0,
    actual: extraClasses.length,
    sampleErrors: extraClasses.slice(0, 10),
  });

  // 1.3 Field accuracy - check each class has correct attributes
  const fieldMismatches: string[] = [];
  for (const expected of expectedClasses) {
    const dbClass = dbClasses.find(c => c.code === expected.code);
    if (dbClass) {
      if (dbClass.fullName !== expected.fullName) {
        fieldMismatches.push(`${expected.code}: fullName mismatch (expected: "${expected.fullName}", got: "${dbClass.fullName}")`);
      }
      if (dbClass.hazardType !== expected.hazardType) {
        fieldMismatches.push(`${expected.code}: hazardType mismatch (expected: "${expected.hazardType}", got: "${dbClass.hazardType}")`);
      }
      if (dbClass.isCmr !== expected.isCmr) {
        fieldMismatches.push(`${expected.code}: isCmr mismatch (expected: ${expected.isCmr}, got: ${dbClass.isCmr})`);
      }
    }
  }

  checks.push({
    name: 'Hazard class field accuracy',
    status: fieldMismatches.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: fieldMismatches.length,
    sampleErrors: fieldMismatches.slice(0, 10),
  });

  // 1.4 CMR class validation
  const cmrClasses = dbClasses.filter(c => c.isCmr);
  const expectedCmr = ['Carc.', 'Muta.', 'Repr.'];
  const cmrCodes = cmrClasses.map(c => c.code).sort();

  checks.push({
    name: 'CMR classes correctly flagged',
    status: JSON.stringify(cmrCodes) === JSON.stringify(expectedCmr) ? 'PASS' : 'FAIL',
    expected: expectedCmr.join(', '),
    actual: cmrCodes.join(', '),
  });

  return {
    name: 'Hazard Class Reference Data',
    description: 'Validates hazard_class table against CLP regulation definitions',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Section 2: H-Statement Reference Data Validation
 */
async function validateHStatements(em: ReturnType<MikroORM['em']['fork']>): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // 2.1 Count validation
  const dbStatements = await em.find(HazardStatement, {});
  const expectedStatements = H_STATEMENTS;

  checks.push({
    name: 'H-statement count',
    status: dbStatements.length >= expectedStatements.length ? 'PASS' : 'WARN',
    expected: `>= ${expectedStatements.length}`,
    actual: dbStatements.length,
  });

  // 2.2 Every expected H-statement exists
  const dbCodes = new Set(dbStatements.map(s => s.code));
  const missingStatements: string[] = [];

  for (const expected of expectedStatements) {
    if (!dbCodes.has(expected.code)) {
      missingStatements.push(expected.code);
    }
  }

  checks.push({
    name: 'All expected H-statements present',
    status: missingStatements.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: missingStatements.length,
    sampleErrors: missingStatements.slice(0, 10),
  });

  // 2.3 Translation completeness
  const requiredLanguages = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'sv', 'da', 'fi', 'el', 'cs', 'hu', 'ro', 'bg', 'sk', 'sl', 'lt', 'lv', 'et', 'hr', 'mt', 'ga'];
  const translationIssues: string[] = [];

  for (const stmt of dbStatements) {
    const translations = stmt.translations || {};
    const missingLangs = requiredLanguages.filter(lang => !translations[lang]);
    if (missingLangs.length > 0 && missingLangs.length < requiredLanguages.length) {
      // Partially translated
      translationIssues.push(`${stmt.code}: missing ${missingLangs.length} languages (${missingLangs.slice(0, 3).join(', ')}...)`);
    }
  }

  // Count statements with complete translations
  const completeTranslations = dbStatements.filter(s => {
    const translations = s.translations || {};
    return requiredLanguages.every(lang => translations[lang]);
  }).length;

  checks.push({
    name: 'H-statements with complete translations (24 languages)',
    status: completeTranslations === dbStatements.length ? 'PASS' : 'WARN',
    expected: dbStatements.length,
    actual: completeTranslations,
    details: [`${((completeTranslations / dbStatements.length) * 100).toFixed(1)}% complete`],
  });

  // 2.4 English translation for all
  const missingEnglish = dbStatements.filter(s => !s.translations?.['en']);

  checks.push({
    name: 'All H-statements have English translation',
    status: missingEnglish.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: missingEnglish.length,
    sampleErrors: missingEnglish.map(s => s.code).slice(0, 10),
  });

  return {
    name: 'H-Statement Reference Data',
    description: 'Validates hazard_statement table against CLP H-codes',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Section 3: Substance Data Validation
 */
async function validateSubstances(em: ReturnType<MikroORM['em']['fork']>): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // 3.1 Total substance count
  const totalSubstances = await em.count(Substance, {});
  checks.push({
    name: 'Total substances in database',
    status: totalSubstances > 0 ? 'PASS' : 'FAIL',
    actual: totalSubstances,
  });

  // 3.2 CAS number validation - ALL substances
  console.log('  Validating ALL CAS numbers (this may take a moment)...');
  const substancesWithCas = await em.find(Substance, { casNumber: { $ne: null } });
  const invalidCasNumbers: string[] = [];

  for (const substance of substancesWithCas) {
    if (substance.casNumber && !isValidCasNumber(substance.casNumber)) {
      invalidCasNumbers.push(`${substance.casNumber} (${substance.primaryName?.substring(0, 30) || 'Unknown'})`);
    }
  }

  checks.push({
    name: 'CAS number checksum validation (ALL substances)',
    status: invalidCasNumbers.length === 0 ? 'PASS' : 'WARN',
    expected: 0,
    actual: invalidCasNumbers.length,
    details: [`Checked ${substancesWithCas.length} substances with CAS numbers`],
    sampleErrors: invalidCasNumbers.slice(0, 20),
  });

  // 3.3 Substances with valid identifiers
  const substancesWithBothIds = await em.count(Substance, {
    casNumber: { $ne: null },
    ecNumber: { $ne: null },
  });

  const substancesWithCasOnly = await em.count(Substance, {
    casNumber: { $ne: null },
    ecNumber: null,
  });

  const substancesWithEcOnly = await em.count(Substance, {
    casNumber: null,
    ecNumber: { $ne: null },
  });

  const substancesWithNoIds = await em.count(Substance, {
    casNumber: null,
    ecNumber: null,
  });

  checks.push({
    name: 'Substance identifier distribution',
    status: 'PASS',
    details: [
      `Both CAS + EC: ${substancesWithBothIds}`,
      `CAS only: ${substancesWithCasOnly}`,
      `EC only: ${substancesWithEcOnly}`,
      `No identifiers: ${substancesWithNoIds}`,
    ],
  });

  // 3.4 Duplicate CAS numbers check
  const duplicateCas = await em.execute(`
    SELECT cas_number, COUNT(*) as count
    FROM substance
    WHERE cas_number IS NOT NULL
    GROUP BY cas_number
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `);

  checks.push({
    name: 'Duplicate CAS numbers',
    status: duplicateCas.length === 0 ? 'PASS' : 'WARN',
    expected: 0,
    actual: duplicateCas.length,
    sampleErrors: duplicateCas.map((r: Record<string, unknown>) => `${r['cas_number']}: ${r['count']} occurrences`),
  });

  // 3.5 Stub substances check
  const stubSubstances = await em.count(Substance, {
    sourceVersion: { $like: 'STUB:%' },
  });

  checks.push({
    name: 'Stub substances (created during seeding)',
    status: 'PASS',
    actual: stubSubstances,
    details: ['Stubs are substances not in EC Inventory but referenced by regulatory lists'],
  });

  // 3.6 Primary name validation
  const substancesWithoutName = await em.count(Substance, {
    $or: [
      { primaryName: null },
      { primaryName: '' },
      { primaryName: 'Unknown' },
    ],
  });

  checks.push({
    name: 'Substances with missing/unknown primary name',
    status: substancesWithoutName === 0 ? 'PASS' : 'WARN',
    expected: 0,
    actual: substancesWithoutName,
  });

  return {
    name: 'Substance Data',
    description: 'Validates substance table integrity',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Section 4: CLP Classification Source-to-Database Validation
 * This is the FULL validation - every row from the source XLSX is compared
 */
async function validateClpClassifications(
  em: ReturnType<MikroORM['em']['fork']>,
  xlsxPath: string
): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // Check if source file exists
  if (!fs.existsSync(xlsxPath)) {
    checks.push({
      name: 'Source file availability',
      status: 'FAIL',
      details: [`File not found: ${xlsxPath}`],
    });
    return {
      name: 'CLP Classification Source Validation',
      description: 'Compares ECHA Harmonised List XLSX against database',
      checks,
      passed: false,
    };
  }

  checks.push({
    name: 'Source file availability',
    status: 'PASS',
    details: [xlsxPath],
  });

  // Read source XLSX
  console.log('  Reading source XLSX file...');
  const rows = readXlsxFile<Record<string, string>>(xlsxPath);

  checks.push({
    name: 'Source file row count',
    status: rows.length > 0 ? 'PASS' : 'FAIL',
    actual: rows.length,
  });

  // Get all database classifications
  console.log('  Loading database classifications...');
  const dbClassifications = await em.find(SubstanceHazardClassification, {}, {
    populate: ['substance', 'hazardClass'],
  });

  checks.push({
    name: 'Database classification count',
    status: dbClassifications.length > 0 ? 'PASS' : 'FAIL',
    actual: dbClassifications.length,
  });

  // Build lookup maps - by CAS and EC number
  const dbByCas = new Map<string, SubstanceHazardClassification[]>();
  const dbByEc = new Map<string, SubstanceHazardClassification[]>();
  for (const c of dbClassifications) {
    const cas = c.substance.casNumber;
    const ec = c.substance.ecNumber;
    if (cas) {
      if (!dbByCas.has(cas)) {
        dbByCas.set(cas, []);
      }
      dbByCas.get(cas)!.push(c);
    }
    if (ec) {
      if (!dbByEc.has(ec)) {
        dbByEc.set(ec, []);
      }
      dbByEc.get(ec)!.push(c);
    }
  }

  // Build hazard class lookup
  const hazardClasses = await em.find(HazardClass, {});
  const hazardClassMap = new Map(hazardClasses.map(hc => [hc.code, hc]));

  // Parse and validate each source row
  console.log('  Validating source rows against database (this will take a while)...');
  const parser = new ClpClassificationParser(hazardClassMap);

  let rowsProcessed = 0;
  let rowsWithCas = 0;
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  let classificationsExpectedTotal = 0;  // All classifications from source
  let classificationsExpectedForMatched = 0;  // Classifications for substances we have
  let classificationsExpectedForUnmatched = 0;  // Classifications for substances we don't have
  let classificationsFound = 0;
  let classificationsMissing = 0;

  const missingClassifications: string[] = [];
  const unmatchedSubstances: string[] = [];

  let rowsMatchedByCas = 0;
  let rowsMatchedByEc = 0;

  for (const row of rows) {
    rowsProcessed++;

    const casNumber = row['CAS number']?.trim();
    const ecNumber = row['EC number']?.trim();
    const hazardBlock = row['Hazard class, category and statement code(s)'];

    if (!casNumber || casNumber === '-') {
      continue;
    }

    rowsWithCas++;

    // Parse expected classifications from source
    const expectedClassifications = hazardBlock ? parser.parseClassificationBlock(hazardBlock) : [];
    classificationsExpectedTotal += expectedClassifications.length;

    // Look up in database - try CAS first, then EC number
    let dbMatches = dbByCas.get(casNumber);
    let matchedBy = 'cas';

    if (!dbMatches || dbMatches.length === 0) {
      // Try EC number fallback
      if (ecNumber && ecNumber !== '-') {
        dbMatches = dbByEc.get(ecNumber);
        matchedBy = 'ec';
      }
    }

    if (!dbMatches || dbMatches.length === 0) {
      rowsUnmatched++;
      classificationsExpectedForUnmatched += expectedClassifications.length;
      if (unmatchedSubstances.length < 50) {
        unmatchedSubstances.push(`${casNumber} (EC: ${ecNumber || 'none'}, ${row['International chemical identification']?.substring(0, 30) || 'Unknown'})`);
      }
      continue;
    }

    rowsMatched++;
    if (matchedBy === 'cas') rowsMatchedByCas++;
    else rowsMatchedByEc++;
    classificationsExpectedForMatched += expectedClassifications.length;

    // Verify each expected classification exists in DB
    for (const expected of expectedClassifications) {
      const found = dbMatches.some(db =>
        db.hazardClass.code === expected.hazardClass &&
        (db.category || '') === (expected.category || '') &&
        (db.hCode || '') === (expected.hCode || '')
      );

      if (found) {
        classificationsFound++;
      } else {
        classificationsMissing++;
        if (missingClassifications.length < 50) {
          missingClassifications.push(
            `${casNumber}: ${expected.hazardClass} ${expected.category || ''} (${expected.hCode || 'no H-code'})`
          );
        }
      }
    }

    // Progress indicator
    if (rowsProcessed % 500 === 0) {
      console.log(`    Processed ${rowsProcessed}/${rows.length} rows...`);
    }
  }

  console.log(`    Processed ${rowsProcessed}/${rows.length} rows (complete)`);

  checks.push({
    name: 'Source rows with valid CAS number',
    status: 'PASS',
    actual: rowsWithCas,
    details: [`${((rowsWithCas / rowsProcessed) * 100).toFixed(1)}% of rows have CAS`],
  });

  checks.push({
    name: 'Source substances matched in database',
    status: rowsUnmatched === 0 ? 'PASS' : 'WARN',
    expected: rowsWithCas,
    actual: rowsMatched,
    details: [
      `${rowsMatchedByCas} matched by CAS number`,
      `${rowsMatchedByEc} matched by EC number (fallback)`,
      `${rowsUnmatched} unmatched substances`,
    ],
    sampleErrors: unmatchedSubstances.slice(0, 20),
  });

  // Match rate is calculated only for substances that exist in our database
  // Unmatched substances are reported separately
  const matchRate = classificationsExpectedForMatched > 0
    ? (classificationsFound / classificationsExpectedForMatched) * 100
    : 100;
  checks.push({
    name: 'Classification match rate (for matched substances)',
    status: classificationsMissing === 0 ? 'PASS' : matchRate >= 99 ? 'WARN' : 'FAIL',
    expected: classificationsExpectedForMatched,
    actual: classificationsFound,
    details: [
      `${matchRate.toFixed(2)}% match rate`,
      `${classificationsMissing} classifications missing from matched substances`,
      `${classificationsExpectedForUnmatched} classifications for unmatched substances (not counted)`,
    ],
    sampleErrors: missingClassifications.slice(0, 20),
  });

  // Check for extra classifications in DB not in source
  const sourceClassificationKeys = new Set<string>();
  for (const row of rows) {
    const casNumber = row['CAS number']?.trim();
    if (!casNumber || casNumber === '-') continue;

    const hazardBlock = row['Hazard class, category and statement code(s)'];
    const classifications = hazardBlock ? parser.parseClassificationBlock(hazardBlock) : [];

    for (const c of classifications) {
      const key = `${casNumber}|${c.hazardClass}|${c.category || ''}|${c.hCode || ''}`;
      sourceClassificationKeys.add(key);
    }
  }

  let extraClassifications = 0;
  const extraClassificationSamples: string[] = [];

  for (const [cas, dbClasses] of dbByCas) {
    for (const c of dbClasses) {
      const key = `${cas}|${c.hazardClass.code}|${c.category || ''}|${c.hCode || ''}`;
      if (!sourceClassificationKeys.has(key)) {
        extraClassifications++;
        if (extraClassificationSamples.length < 20) {
          extraClassificationSamples.push(
            `${cas}: ${c.hazardClass.code} ${c.category || ''} (${c.hCode || 'no H-code'})`
          );
        }
      }
    }
  }

  checks.push({
    name: 'Extra classifications in DB (not in source)',
    status: extraClassifications === 0 ? 'PASS' : 'WARN',
    expected: 0,
    actual: extraClassifications,
    details: ['These may be from previous ATP versions or manual additions'],
    sampleErrors: extraClassificationSamples,
  });

  return {
    name: 'CLP Classification Source Validation',
    description: 'Full row-by-row comparison of ECHA Harmonised List XLSX against database',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Section 5: H-Code to Hazard Class Consistency
 */
async function validateHCodeConsistency(em: ReturnType<MikroORM['em']['fork']>): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // Official H-code to hazard class mapping per CLP Annex I
  const H_CODE_CLASS_MAP: Record<string, string[]> = {
    // Physical hazards
    H200: ['Unst. Expl.'], H201: ['Expl.'], H202: ['Expl.'], H203: ['Expl.'], H204: ['Expl.'], H205: ['Expl.'],
    H220: ['Flam. Gas'], H221: ['Flam. Gas'], H222: ['Aerosol'], H223: ['Aerosol'], H224: ['Flam. Liq.'],
    H225: ['Flam. Liq.'], H226: ['Flam. Liq.'], H227: ['Flam. Liq.'], H228: ['Flam. Sol.'],
    H229: ['Aerosol'],
    H230: ['Flam. Gas'], H231: ['Flam. Gas'],
    H240: ['Self-react.', 'Org. Perox.'], H241: ['Self-react.', 'Org. Perox.'], H242: ['Self-react.', 'Org. Perox.'],
    H250: ['Pyr. Liq.', 'Pyr. Sol.'], H251: ['Self-heat.'], H252: ['Self-heat.'],
    H260: ['Water-react.'], H261: ['Water-react.'],
    H270: ['Ox. Gas'], H271: ['Ox. Liq.', 'Ox. Sol.'], H272: ['Ox. Liq.', 'Ox. Sol.'],
    H280: ['Press. Gas'], H281: ['Press. Gas'], H282: ['Flam. Gas'], H283: ['Flam. Gas'], H284: ['Flam. Gas'],
    H290: ['Met. Corr.'],
    // Health hazards
    H300: ['Acute Tox.'], H301: ['Acute Tox.'], H302: ['Acute Tox.'], H303: ['Acute Tox.'],
    H304: ['Asp. Tox.'], H305: ['Asp. Tox.'],
    H310: ['Acute Tox.'], H311: ['Acute Tox.'], H312: ['Acute Tox.'], H313: ['Acute Tox.'],
    H314: ['Skin Corr.'], H315: ['Skin Irrit.'], H316: ['Skin Irrit.'], H317: ['Skin Sens.'],
    H318: ['Eye Dam.'], H319: ['Eye Irrit.'], H320: ['Eye Irrit.'],
    H330: ['Acute Tox.'], H331: ['Acute Tox.'], H332: ['Acute Tox.'], H333: ['Acute Tox.'],
    H334: ['Resp. Sens.'], H335: ['STOT SE'], H336: ['STOT SE'],
    H340: ['Muta.'], H341: ['Muta.'],
    H350: ['Carc.'], H350i: ['Carc.'], H351: ['Carc.'],
    H360: ['Repr.'], H360F: ['Repr.'], H360D: ['Repr.'], H360FD: ['Repr.'], H360Fd: ['Repr.'], H360Df: ['Repr.'],
    H361: ['Repr.'], H361f: ['Repr.'], H361d: ['Repr.'], H361fd: ['Repr.'],
    H362: ['Lact.'],
    H370: ['STOT SE'], H371: ['STOT SE'], H372: ['STOT RE'], H373: ['STOT RE'],
    // Environmental hazards
    H400: ['Aquatic Acute'], H401: ['Aquatic Acute'], H402: ['Aquatic Acute'],
    H410: ['Aquatic Chronic'], H411: ['Aquatic Chronic'], H412: ['Aquatic Chronic'], H413: ['Aquatic Chronic'],
    H420: ['Ozone'],
  };

  // Get all distinct H-code to hazard class combinations from database
  const dbMappings = await em.execute(`
    SELECT DISTINCT h_code, hazard_class_code, COUNT(*) as count
    FROM substance_hazard_classification
    WHERE h_code IS NOT NULL
    GROUP BY h_code, hazard_class_code
    ORDER BY h_code, hazard_class_code
  `);

  const invalidMappings: string[] = [];
  const validMappings = 0;

  for (const row of dbMappings) {
    const hCode = row['h_code'] as string;
    const hazardClass = row['hazard_class_code'] as string;
    const count = Number(row['count']);

    // Extract base H-code (H350i -> H350)
    const baseHCode = hCode.replace(/[a-z]$/i, '');
    const validClasses = H_CODE_CLASS_MAP[hCode] || H_CODE_CLASS_MAP[baseHCode];

    if (validClasses && !validClasses.includes(hazardClass)) {
      invalidMappings.push(`${hCode} -> ${hazardClass} (expected: ${validClasses.join(' or ')}) [${count} records]`);
    }
  }

  checks.push({
    name: 'H-code to hazard class mapping validation',
    status: invalidMappings.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: invalidMappings.length,
    details: [`Checked ${dbMappings.length} distinct H-code/class combinations`],
    sampleErrors: invalidMappings.slice(0, 20),
  });

  // Check for classifications without H-codes
  const noHCodeCount = await em.execute(`
    SELECT COUNT(*) as count FROM substance_hazard_classification WHERE h_code IS NULL
  `);

  checks.push({
    name: 'Classifications without H-code',
    status: 'PASS',
    actual: Number(noHCodeCount[0]?.['count'] || 0),
    details: ['Some classifications (like general category notes) may not have H-codes'],
  });

  return {
    name: 'H-Code Consistency',
    description: 'Validates H-code to hazard class mappings per CLP Annex I',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Section 6: Referential Integrity
 */
async function validateReferentialIntegrity(em: ReturnType<MikroORM['em']['fork']>): Promise<ValidationSection> {
  const checks: ValidationCheck[] = [];

  // 6.1 Orphaned classifications (no matching substance)
  const orphanedClassifications = await em.execute(`
    SELECT COUNT(*) as count FROM substance_hazard_classification shc
    LEFT JOIN substance s ON s.id = shc.substance_id
    WHERE s.id IS NULL
  `);

  checks.push({
    name: 'Orphaned classifications (no substance)',
    status: Number(orphanedClassifications[0]?.['count'] || 0) === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: Number(orphanedClassifications[0]?.['count'] || 0),
  });

  // 6.2 Invalid hazard class references
  const invalidHazardClassRefs = await em.execute(`
    SELECT COUNT(*) as count FROM substance_hazard_classification shc
    LEFT JOIN hazard_class hc ON hc.code = shc.hazard_class_code
    WHERE hc.code IS NULL
  `);

  checks.push({
    name: 'Invalid hazard class references',
    status: Number(invalidHazardClassRefs[0]?.['count'] || 0) === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: Number(invalidHazardClassRefs[0]?.['count'] || 0),
  });

  // 6.3 Duplicate classifications
  const duplicateClassifications = await em.execute(`
    SELECT substance_id, hazard_class_code, category, h_code, COUNT(*) as count
    FROM substance_hazard_classification
    GROUP BY substance_id, hazard_class_code, category, h_code
    HAVING COUNT(*) > 1
    LIMIT 20
  `);

  checks.push({
    name: 'Duplicate classifications',
    status: duplicateClassifications.length === 0 ? 'PASS' : 'FAIL',
    expected: 0,
    actual: duplicateClassifications.length,
    sampleErrors: duplicateClassifications.map((r: Record<string, unknown>) =>
      `substance ${r['substance_id']}: ${r['hazard_class_code']} ${r['category'] || ''} (${r['h_code'] || 'no H-code'}) x${r['count']}`
    ),
  });

  return {
    name: 'Referential Integrity',
    description: 'Validates foreign key relationships and uniqueness constraints',
    checks,
    passed: checks.every(c => c.status !== 'FAIL'),
  };
}

/**
 * Generate text report
 */
function generateReport(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('GSR DATA INTEGRITY VALIDATION REPORT');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Generated: ${report.timestamp}`);
  lines.push(`Duration: ${(report.duration / 1000).toFixed(1)} seconds`);
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('SUMMARY');
  lines.push('-'.repeat(80));
  lines.push(`Total Checks: ${report.summary.totalChecks}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push('');

  for (const section of report.sections) {
    lines.push('='.repeat(80));
    lines.push(`SECTION: ${section.name}`);
    lines.push(section.description);
    lines.push(`Status: ${section.passed ? 'PASSED' : 'FAILED'}`);
    lines.push('='.repeat(80));
    lines.push('');

    for (const check of section.checks) {
      const statusIcon = check.status === 'PASS' ? '✓' : check.status === 'FAIL' ? '✗' : '⚠';
      lines.push(`[${statusIcon}] ${check.name}`);

      if (check.expected !== undefined) {
        lines.push(`    Expected: ${check.expected}`);
      }
      if (check.actual !== undefined) {
        lines.push(`    Actual: ${check.actual}`);
      }
      if (check.details && check.details.length > 0) {
        for (const detail of check.details) {
          lines.push(`    - ${detail}`);
        }
      }
      if (check.sampleErrors && check.sampleErrors.length > 0) {
        lines.push(`    Sample issues (first ${check.sampleErrors.length}):`);
        for (const err of check.sampleErrors) {
          lines.push(`      • ${err}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('='.repeat(80));
  if (report.summary.failed === 0) {
    lines.push('OVERALL RESULT: ✓ VALIDATION PASSED');
  } else {
    lines.push('OVERALL RESULT: ✗ VALIDATION FAILED');
  }
  lines.push('='.repeat(80));

  return lines.join('\n');
}

/**
 * Main validation entry point
 */
export async function runFullValidation(xlsxPath?: string): Promise<ValidationReport> {
  const startTime = Date.now();
  const sections: ValidationSection[] = [];

  const orm = await getOrm();
  const em = orm.em.fork();

  console.log('Starting comprehensive data integrity validation...\n');

  // Section 1: Hazard Classes
  console.log('1. Validating Hazard Class Reference Data...');
  sections.push(await validateHazardClasses(em));

  // Section 2: H-Statements
  console.log('2. Validating H-Statement Reference Data...');
  sections.push(await validateHStatements(em));

  // Section 3: Substances
  console.log('3. Validating Substance Data...');
  sections.push(await validateSubstances(em));

  // Section 4: CLP Source Comparison (if XLSX provided)
  const defaultXlsxPath = path.join(process.cwd(), 'data', 'Harmonised_List_2026-02-01 17_42_11.xlsx');
  const actualXlsxPath = xlsxPath || defaultXlsxPath;

  console.log('4. Validating CLP Classifications against source XLSX...');
  sections.push(await validateClpClassifications(em, actualXlsxPath));

  // Section 5: H-Code Consistency
  console.log('5. Validating H-Code to Hazard Class Consistency...');
  sections.push(await validateHCodeConsistency(em));

  // Section 6: Referential Integrity
  console.log('6. Validating Referential Integrity...');
  sections.push(await validateReferentialIntegrity(em));

  await cleanupOrm();

  const duration = Date.now() - startTime;

  // Calculate summary
  let totalChecks = 0;
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const section of sections) {
    for (const check of section.checks) {
      totalChecks++;
      if (check.status === 'PASS') passed++;
      else if (check.status === 'FAIL') failed++;
      else if (check.status === 'WARN') warnings++;
    }
  }

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    duration,
    sections,
    summary: { totalChecks, passed, failed, warnings },
  };

  // Print report
  console.log('\n' + generateReport(report));

  // Save report to file
  const reportPath = path.join(process.cwd(), `validation-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.writeFileSync(reportPath, generateReport(report));
  console.log(`\nReport saved to: ${reportPath}`);

  return report;
}
