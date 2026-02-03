// packages/gsr/src/cli/validate.ts
import type { MikroORM } from '@mikro-orm/postgresql';
import { initOrm, closeOrm, Substance, isValidCasNumber } from '@eurocomply/database';
import { HazardClass } from '../entities/HazardClass.js';
import { HazardStatement } from '../entities/HazardStatement.js';
import { SubstanceHazardClassification } from '../entities/SubstanceHazardClassification.js';
import { gsrEntities } from '../entities/index.js';

/**
 * Known reference substances for spot-check validation.
 * Data verified against ECHA CLP Annex VI.
 */
const REFERENCE_SUBSTANCES: Array<{
  casNumber: string;
  name: string;
  expectedClassifications: Array<{
    hazardClass: string;
    category: string;
    hCode: string;
  }>;
}> = [
  {
    casNumber: '50-00-0',
    name: 'Formaldehyde',
    expectedClassifications: [
      { hazardClass: 'Carc.', category: '1B', hCode: 'H350' },
      { hazardClass: 'Muta.', category: '2', hCode: 'H341' },
      { hazardClass: 'Acute Tox.', category: '3', hCode: 'H301' },
      { hazardClass: 'Acute Tox.', category: '3', hCode: 'H311' },
      { hazardClass: 'Acute Tox.', category: '3', hCode: 'H331' },
      { hazardClass: 'Skin Corr.', category: '1B', hCode: 'H314' },
      { hazardClass: 'Skin Sens.', category: '1', hCode: 'H317' },
    ],
  },
  {
    casNumber: '71-43-2',
    name: 'Benzene',
    expectedClassifications: [
      { hazardClass: 'Carc.', category: '1A', hCode: 'H350' },
      { hazardClass: 'Muta.', category: '1B', hCode: 'H340' },
      { hazardClass: 'Flam. Liq.', category: '2', hCode: 'H225' },
      { hazardClass: 'Asp. Tox.', category: '1', hCode: 'H304' },
      { hazardClass: 'STOT RE', category: '1', hCode: 'H372' },
      { hazardClass: 'Skin Irrit.', category: '2', hCode: 'H315' },
      { hazardClass: 'Eye Irrit.', category: '2', hCode: 'H319' },
    ],
  },
  {
    casNumber: '7439-92-1',
    name: 'Lead',
    expectedClassifications: [
      { hazardClass: 'Repr.', category: '1A', hCode: 'H360FD' },
      { hazardClass: 'Lact.', category: '', hCode: 'H362' },
      { hazardClass: 'Aquatic Acute', category: '1', hCode: 'H400' },
      { hazardClass: 'Aquatic Chronic', category: '1', hCode: 'H410' },
    ],
  },
  {
    casNumber: '7440-43-9',
    name: 'Cadmium',
    expectedClassifications: [
      { hazardClass: 'Carc.', category: '1B', hCode: 'H350' },
      { hazardClass: 'Muta.', category: '2', hCode: 'H341' },
      { hazardClass: 'Repr.', category: '2', hCode: 'H361fd' },
      { hazardClass: 'Acute Tox.', category: '2', hCode: 'H330' },
      { hazardClass: 'STOT RE', category: '1', hCode: 'H372' },
      { hazardClass: 'Aquatic Acute', category: '1', hCode: 'H400' },
      { hazardClass: 'Aquatic Chronic', category: '1', hCode: 'H410' },
    ],
  },
];

/**
 * H-code to hazard class mapping for validation.
 */
const H_CODE_CLASS_MAP: Record<string, string[]> = {
  // Physical hazards
  H200: ['Unst. Expl.'],
  H220: ['Flam. Gas'],
  H225: ['Flam. Liq.'],
  H226: ['Flam. Liq.'],
  H228: ['Flam. Sol.'],
  H240: ['Self-react.', 'Org. Perox.'],
  H241: ['Self-react.', 'Org. Perox.'],
  H242: ['Self-react.', 'Org. Perox.'],
  H270: ['Ox. Gas'],
  H271: ['Ox. Liq.', 'Ox. Sol.'],
  H272: ['Ox. Liq.', 'Ox. Sol.'],
  H280: ['Press. Gas'],
  H281: ['Press. Gas'],
  H290: ['Met. Corr.'],
  // Health hazards
  H300: ['Acute Tox.'],
  H301: ['Acute Tox.'],
  H302: ['Acute Tox.'],
  H304: ['Asp. Tox.'],
  H310: ['Acute Tox.'],
  H311: ['Acute Tox.'],
  H312: ['Acute Tox.'],
  H314: ['Skin Corr.'],
  H315: ['Skin Irrit.'],
  H317: ['Skin Sens.'],
  H318: ['Eye Dam.'],
  H319: ['Eye Irrit.'],
  H330: ['Acute Tox.'],
  H331: ['Acute Tox.'],
  H332: ['Acute Tox.'],
  H334: ['Resp. Sens.'],
  H335: ['STOT SE'],
  H336: ['STOT SE'],
  H340: ['Muta.'],
  H341: ['Muta.'],
  H350: ['Carc.'],
  H350i: ['Carc.'],
  H351: ['Carc.'],
  H360: ['Repr.'],
  H360F: ['Repr.'],
  H360D: ['Repr.'],
  H360FD: ['Repr.'],
  H360Fd: ['Repr.'],
  H360Df: ['Repr.'],
  H361: ['Repr.'],
  H361f: ['Repr.'],
  H361d: ['Repr.'],
  H361fd: ['Repr.'],
  H362: ['Lact.'],  // Effects on or via lactation
  H370: ['STOT SE'],
  H371: ['STOT SE'],
  H372: ['STOT RE'],
  H373: ['STOT RE'],
  // Environmental hazards
  H400: ['Aquatic Acute'],
  H410: ['Aquatic Chronic'],
  H411: ['Aquatic Chronic'],
  H412: ['Aquatic Chronic'],
  H413: ['Aquatic Chronic'],
  H420: ['Ozone'],
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, number | string>;
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
 * Validates CLP data integrity.
 */
export async function validateClpData(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: Record<string, number | string> = {};

  const orm = await getOrm();
  const em = orm.em.fork();

  console.log('Validating CLP data integrity...\n');

  // 1. Count validation
  console.log('1. Checking record counts...');
  const substanceCount = await em.count(Substance, {});
  const classificationCount = await em.count(SubstanceHazardClassification, {});
  const hazardClassCount = await em.count(HazardClass, {});
  const hStatementCount = await em.count(HazardStatement, {});

  stats['substances'] = substanceCount;
  stats['classifications'] = classificationCount;
  stats['hazardClasses'] = hazardClassCount;
  stats['hStatements'] = hStatementCount;

  if (hazardClassCount !== 34) {
    warnings.push(`Expected 34 hazard classes (33 main + Lact.), found ${hazardClassCount}`);
  }
  if (hStatementCount < 90) {
    warnings.push(`Expected ~91 H-statements, found ${hStatementCount}`);
  }
  console.log(`   Substances: ${substanceCount}`);
  console.log(`   Classifications: ${classificationCount}`);
  console.log(`   Hazard classes: ${hazardClassCount}`);
  console.log(`   H-statements: ${hStatementCount}`);

  // 2. Orphan check - classifications without valid substance
  console.log('\n2. Checking for orphaned records...');
  const orphanedClassifications = await em.execute(`
    SELECT COUNT(*) as count FROM substance_hazard_classification shc
    LEFT JOIN substance s ON s.id = shc.substance_id
    WHERE s.id IS NULL
  `);
  const orphanCount = Number(orphanedClassifications[0]?.['count'] || 0);
  stats['orphanedClassifications'] = orphanCount;
  if (orphanCount > 0) {
    errors.push(`Found ${orphanCount} orphaned classifications (no matching substance)`);
  }
  console.log(`   Orphaned classifications: ${orphanCount}`);

  // 3. H-code to hazard class consistency
  console.log('\n3. Validating H-code to hazard class mappings...');
  const invalidMappings = await em.execute(`
    SELECT DISTINCT shc.h_code, shc.hazard_class_code, COUNT(*) as count
    FROM substance_hazard_classification shc
    WHERE shc.h_code IS NOT NULL
    GROUP BY shc.h_code, shc.hazard_class_code
    ORDER BY shc.h_code
  `);

  let mappingErrors = 0;
  for (const row of invalidMappings) {
    const hCode = row['h_code'] as string;
    const hazardClass = row['hazard_class_code'] as string;
    const validClasses = H_CODE_CLASS_MAP[hCode];

    if (validClasses && !validClasses.includes(hazardClass)) {
      mappingErrors++;
      if (mappingErrors <= 5) {
        warnings.push(`H-code ${hCode} mapped to ${hazardClass}, expected one of: ${validClasses.join(', ')}`);
      }
    }
  }
  stats['hCodeMappingErrors'] = mappingErrors;
  if (mappingErrors > 5) {
    warnings.push(`... and ${mappingErrors - 5} more H-code mapping issues`);
  }
  console.log(`   H-code mapping issues: ${mappingErrors}`);

  // 4. CAS number validation
  console.log('\n4. Validating CAS number checksums...');
  const substances = await em.find(Substance, { casNumber: { $ne: null } }, { limit: 10000 });
  let invalidCasCount = 0;
  for (const substance of substances) {
    if (substance.casNumber && !isValidCasNumber(substance.casNumber)) {
      invalidCasCount++;
      if (invalidCasCount <= 3) {
        warnings.push(`Invalid CAS checksum: ${substance.casNumber} (${substance.primaryName})`);
      }
    }
  }
  stats['invalidCasChecksums'] = invalidCasCount;
  if (invalidCasCount > 3) {
    warnings.push(`... and ${invalidCasCount - 3} more invalid CAS numbers`);
  }
  console.log(`   Invalid CAS checksums: ${invalidCasCount}`);

  // 5. Reference substance spot-checks
  console.log('\n5. Spot-checking reference substances...');
  let spotCheckPassed = 0;
  let spotCheckFailed = 0;

  for (const ref of REFERENCE_SUBSTANCES) {
    const substance = await em.findOne(Substance, { casNumber: ref.casNumber });
    if (!substance) {
      errors.push(`Reference substance ${ref.name} (${ref.casNumber}) not found in database`);
      spotCheckFailed++;
      continue;
    }

    const classifications = await em.find(SubstanceHazardClassification, {
      substance: substance,
    }, { populate: ['hazardClass'] });

    // Check each expected classification exists
    let allFound = true;
    for (const expected of ref.expectedClassifications) {
      const found = classifications.some(
        (c) =>
          c.hazardClass.code === expected.hazardClass &&
          // Handle null/undefined/empty string as equivalent for category
          (c.category || '') === (expected.category || '') &&
          c.hCode === expected.hCode
      );
      if (!found) {
        allFound = false;
        errors.push(
          `${ref.name}: Missing classification ${expected.hazardClass} ${expected.category} (${expected.hCode})`
        );
      }
    }

    if (allFound) {
      spotCheckPassed++;
      console.log(`   ✓ ${ref.name} (${ref.casNumber})`);
    } else {
      spotCheckFailed++;
      console.log(`   ✗ ${ref.name} (${ref.casNumber}) - missing classifications`);
    }
  }
  stats['spotCheckPassed'] = spotCheckPassed;
  stats['spotCheckFailed'] = spotCheckFailed;

  // 6. CMR substance count
  console.log('\n6. Checking CMR substance counts...');
  const cmrCounts = await em.execute(`
    SELECT hc.code, COUNT(DISTINCT shc.substance_id) as count
    FROM substance_hazard_classification shc
    JOIN hazard_class hc ON hc.code = shc.hazard_class_code
    WHERE hc.is_cmr = true
    GROUP BY hc.code
    ORDER BY hc.code
  `);
  for (const row of cmrCounts) {
    const code = row['code'] as string;
    const count = Number(row['count']);
    stats[`cmr_${code}`] = count;
    console.log(`   ${code}: ${count} substances`);
  }

  // Summary
  const valid = errors.length === 0;
  stats['valid'] = valid ? 'PASS' : 'FAIL';
  stats['errorCount'] = errors.length;
  stats['warningCount'] = warnings.length;

  return { valid, errors, warnings, stats };
}

/**
 * Main validation command.
 */
export async function runValidation(): Promise<void> {
  try {
    const result = await validateClpData();

    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      for (const error of result.errors) {
        console.log(`   • ${error}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      for (const warning of result.warnings) {
        console.log(`   • ${warning}`);
      }
    }

    console.log('\n📊 STATISTICS:');
    for (const [key, value] of Object.entries(result.stats)) {
      if (!key.startsWith('cmr_')) {
        console.log(`   ${key}: ${value}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    if (result.valid) {
      console.log('✅ VALIDATION PASSED');
    } else {
      console.log('❌ VALIDATION FAILED');
    }
    console.log('='.repeat(60));
  } finally {
    await cleanupOrm();
  }
}
