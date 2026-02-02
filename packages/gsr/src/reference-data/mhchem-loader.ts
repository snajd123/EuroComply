// packages/gsr/src/reference-data/mhchem-loader.ts

/**
 * Loader for H-statements from mhchem/hpstatements GitHub repository.
 *
 * This loads official CLP H-statements with translations for all 24 EU languages
 * from the authoritative mhchem data source.
 *
 * Data source: https://github.com/mhchem/hpstatements
 * License: CC BY 4.0 (© European Union, https://eur-lex.europa.eu, 1998-2025)
 */

/**
 * EU official languages supported by mhchem/hpstatements.
 * These are the 24 official languages of the EU.
 */
export const EU_LANGUAGES = [
  'bg', // Bulgarian
  'cs', // Czech
  'da', // Danish
  'de', // German
  'el', // Greek
  'en', // English
  'es', // Spanish
  'et', // Estonian
  'fi', // Finnish
  'fr', // French
  'ga', // Irish
  'hr', // Croatian
  'hu', // Hungarian
  'it', // Italian
  'lt', // Lithuanian
  'lv', // Latvian
  'mt', // Maltese
  'nl', // Dutch
  'pl', // Polish
  'pt', // Portuguese
  'ro', // Romanian
  'sk', // Slovak
  'sl', // Slovenian
  'sv', // Swedish
] as const;

export type EuLanguage = (typeof EU_LANGUAGES)[number];

/**
 * Base URL for mhchem hpstatements JSON files.
 */
const MHCHEM_BASE_URL = 'https://mhchem.github.io/hpstatements/clp';

/**
 * Structure of the mhchem JSON response.
 */
export interface MhchemHpStatementsJson {
  _apiVersion: number;
  _contentVersion: string;
  _licenseLong: string;
  _licenseShort: string;
  _source: string;
  _url: string;
  codes: string[];
  statements: Record<string, string>; // e.g., "latest/en/H350" -> "May cause cancer."
}

/**
 * H-statement with translations for all available languages.
 */
export interface HStatementWithTranslations {
  code: string;
  translations: Partial<Record<EuLanguage, string>>;
}

/**
 * Result of loading H-statements from mhchem.
 */
export interface MhchemLoadResult {
  success: boolean;
  statements: HStatementWithTranslations[];
  languagesLoaded: EuLanguage[];
  languagesFailed: EuLanguage[];
  errors: string[];
}

/**
 * Extracts H-statements from mhchem JSON.
 * Filters to only include H-codes (not P-codes or EUH-codes).
 *
 * @param json - The parsed mhchem JSON
 * @param lang - The language code
 * @returns Map of H-code to statement text
 */
function extractHStatements(json: MhchemHpStatementsJson, lang: EuLanguage): Map<string, string> {
  const result = new Map<string, string>();

  for (const [key, value] of Object.entries(json.statements)) {
    // Keys are like "latest/en/H350" or "latest/de/H350"
    const parts = key.split('/');
    if (parts.length !== 3) continue;

    const keyLang = parts[1]!;
    const code = parts[2]!;

    // Only include H-statements for the target language
    if (keyLang !== lang) continue;
    if (!code.startsWith('H')) continue;

    result.set(code, value);
  }

  return result;
}

/**
 * Fetches H-statements JSON for a specific language from mhchem.
 *
 * @param lang - The EU language code (e.g., 'en', 'de', 'fr')
 * @returns The parsed JSON or null if fetch failed
 */
async function fetchLanguageJson(lang: EuLanguage): Promise<MhchemHpStatementsJson | null> {
  const url = `${MHCHEM_BASE_URL}/hpstatements-${lang}-latest.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as MhchemHpStatementsJson;
  } catch {
    return null;
  }
}

/**
 * Loads H-statements from mhchem for all EU languages.
 *
 * This function:
 * 1. Fetches JSON files for each of the 24 EU languages
 * 2. Extracts H-statements (not P-codes or EUH-codes)
 * 3. Combines translations into a single structure per H-code
 *
 * @returns Result containing H-statements with all available translations
 */
export async function loadHStatementsFromMhchem(): Promise<MhchemLoadResult> {
  const languagesLoaded: EuLanguage[] = [];
  const languagesFailed: EuLanguage[] = [];
  const errors: string[] = [];

  // Map to collect translations: H-code -> language -> text
  const translationsByCode = new Map<string, Partial<Record<EuLanguage, string>>>();

  // Fetch all languages in parallel
  const fetchPromises = EU_LANGUAGES.map(async (lang) => {
    const json = await fetchLanguageJson(lang);
    if (!json) {
      languagesFailed.push(lang);
      errors.push(`Failed to fetch ${lang} from mhchem`);
      return;
    }

    languagesLoaded.push(lang);
    const statements = extractHStatements(json, lang);

    for (const [code, text] of statements) {
      if (!translationsByCode.has(code)) {
        translationsByCode.set(code, {});
      }
      translationsByCode.get(code)![lang] = text;
    }
  });

  await Promise.all(fetchPromises);

  // Convert map to array of HStatementWithTranslations
  const statements: HStatementWithTranslations[] = [];
  for (const [code, translations] of translationsByCode) {
    statements.push({ code, translations });
  }

  // Sort by code for consistent ordering
  statements.sort((a, b) => {
    // Sort H-codes numerically: H200 < H300 < H350 < H350i
    const aNum = parseInt(a.code.replace(/[^\d]/g, ''), 10);
    const bNum = parseInt(b.code.replace(/[^\d]/g, ''), 10);
    if (aNum !== bNum) return aNum - bNum;
    return a.code.localeCompare(b.code);
  });

  return {
    success: languagesLoaded.length > 0,
    statements,
    languagesLoaded,
    languagesFailed,
    errors,
  };
}

/**
 * Loads H-statements for a single language (useful for testing).
 *
 * @param lang - The language to load
 * @returns Array of H-statements for that language only
 */
export async function loadHStatementsForLanguage(
  lang: EuLanguage
): Promise<HStatementWithTranslations[]> {
  const json = await fetchLanguageJson(lang);
  if (!json) {
    return [];
  }

  const statements = extractHStatements(json, lang);
  const result: HStatementWithTranslations[] = [];

  for (const [code, text] of statements) {
    result.push({
      code,
      translations: { [lang]: text },
    });
  }

  return result;
}
