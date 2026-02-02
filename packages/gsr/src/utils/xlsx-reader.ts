// packages/gsr/src/utils/xlsx-reader.ts
import XLSX from 'xlsx';

/**
 * Reads an XLSX file and returns rows as an array of objects.
 * Column headers become object keys.
 *
 * @param filePath - Path to the XLSX file
 * @param sheetIndex - Which sheet to read (default: 0, first sheet)
 * @returns Array of row objects
 */
export function readXlsxFile<T>(
  filePath: string,
  sheetIndex = 0
): T[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[sheetIndex];

  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  // Convert to JSON with headers as keys
  const rows = XLSX.utils.sheet_to_json<T>(sheet, {
    defval: '', // Default value for empty cells
    raw: false, // Return formatted strings, not raw values
  });

  return rows;
}

/**
 * Detects file format based on extension.
 */
export function detectFileFormat(filePath: string): 'csv' | 'xlsx' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return 'xlsx';
  }
  return 'csv';
}
