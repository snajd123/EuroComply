// packages/database/src/seeds/unece-units.ts
import { UnitSystem } from '../entities/enums/index.js';

export interface UnitSeedData {
  code: string;
  name: string;
  symbol: string;
  system: UnitSystem;
  factor: string;
  isBase: boolean;
}

/**
 * UNECE Recommendation 20 units - curated subset for EuroComply.
 * Full list: https://unece.org/trade/uncefact/cl-recommendations
 */
export const uneceUnits: UnitSeedData[] = [
  // ─────────────────────────────────────────────────────────────
  // MASS (Base: KGM - Kilogram)
  // ─────────────────────────────────────────────────────────────
  { code: 'KGM', name: 'Kilogram', symbol: 'kg', system: UnitSystem.MASS, factor: '1', isBase: true },
  { code: 'GRM', name: 'Gram', symbol: 'g', system: UnitSystem.MASS, factor: '0.001', isBase: false },
  { code: 'MGM', name: 'Milligram', symbol: 'mg', system: UnitSystem.MASS, factor: '0.000001', isBase: false },
  { code: 'TNE', name: 'Metric ton', symbol: 't', system: UnitSystem.MASS, factor: '1000', isBase: false },
  { code: 'LBR', name: 'Pound', symbol: 'lb', system: UnitSystem.MASS, factor: '0.45359237', isBase: false },
  { code: 'OZA', name: 'Ounce', symbol: 'oz', system: UnitSystem.MASS, factor: '0.0283495231', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // LENGTH (Base: MTR - Metre)
  // ─────────────────────────────────────────────────────────────
  { code: 'MTR', name: 'Metre', symbol: 'm', system: UnitSystem.LENGTH, factor: '1', isBase: true },
  { code: 'CMT', name: 'Centimetre', symbol: 'cm', system: UnitSystem.LENGTH, factor: '0.01', isBase: false },
  { code: 'MMT', name: 'Millimetre', symbol: 'mm', system: UnitSystem.LENGTH, factor: '0.001', isBase: false },
  { code: 'KMT', name: 'Kilometre', symbol: 'km', system: UnitSystem.LENGTH, factor: '1000', isBase: false },
  { code: 'INH', name: 'Inch', symbol: 'in', system: UnitSystem.LENGTH, factor: '0.0254', isBase: false },
  { code: 'FOT', name: 'Foot', symbol: 'ft', system: UnitSystem.LENGTH, factor: '0.3048', isBase: false },
  { code: 'YRD', name: 'Yard', symbol: 'yd', system: UnitSystem.LENGTH, factor: '0.9144', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // AREA (Base: MTK - Square metre)
  // ─────────────────────────────────────────────────────────────
  { code: 'MTK', name: 'Square metre', symbol: 'm²', system: UnitSystem.AREA, factor: '1', isBase: true },
  { code: 'CMK', name: 'Square centimetre', symbol: 'cm²', system: UnitSystem.AREA, factor: '0.0001', isBase: false },
  { code: 'DMK', name: 'Square decimetre', symbol: 'dm²', system: UnitSystem.AREA, factor: '0.01', isBase: false },
  { code: 'HAR', name: 'Hectare', symbol: 'ha', system: UnitSystem.AREA, factor: '10000', isBase: false },
  { code: 'INK', name: 'Square inch', symbol: 'in²', system: UnitSystem.AREA, factor: '0.00064516', isBase: false },
  { code: 'FTK', name: 'Square foot', symbol: 'ft²', system: UnitSystem.AREA, factor: '0.09290304', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // VOLUME (Base: MTQ - Cubic metre)
  // ─────────────────────────────────────────────────────────────
  { code: 'MTQ', name: 'Cubic metre', symbol: 'm³', system: UnitSystem.VOLUME, factor: '1', isBase: true },
  { code: 'LTR', name: 'Litre', symbol: 'L', system: UnitSystem.VOLUME, factor: '0.001', isBase: false },
  { code: 'MLT', name: 'Millilitre', symbol: 'mL', system: UnitSystem.VOLUME, factor: '0.000001', isBase: false },
  { code: 'CMQ', name: 'Cubic centimetre', symbol: 'cm³', system: UnitSystem.VOLUME, factor: '0.000001', isBase: false },
  { code: 'HLT', name: 'Hectolitre', symbol: 'hL', system: UnitSystem.VOLUME, factor: '0.1', isBase: false },
  { code: 'GLL', name: 'Gallon (US)', symbol: 'gal', system: UnitSystem.VOLUME, factor: '0.00378541', isBase: false },
  { code: 'OZI', name: 'Fluid ounce (US)', symbol: 'fl oz', system: UnitSystem.VOLUME, factor: '0.0000295735', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // TEMPERATURE (Base: CEL - Degree Celsius)
  // ─────────────────────────────────────────────────────────────
  { code: 'CEL', name: 'Degree Celsius', symbol: '°C', system: UnitSystem.TEMPERATURE, factor: '1', isBase: true },
  { code: 'FAH', name: 'Degree Fahrenheit', symbol: '°F', system: UnitSystem.TEMPERATURE, factor: '0.5555556', isBase: false },
  // Note: Temperature conversion is not linear; this factor is for relative differences only

  // ─────────────────────────────────────────────────────────────
  // PERCENTAGE (Base: P1 - Percent)
  // ─────────────────────────────────────────────────────────────
  { code: 'P1', name: 'Percent', symbol: '%', system: UnitSystem.PERCENTAGE, factor: '1', isBase: true },

  // ─────────────────────────────────────────────────────────────
  // COUNT (Base: C62 - One/Unit)
  // ─────────────────────────────────────────────────────────────
  { code: 'C62', name: 'One (unit)', symbol: 'ea', system: UnitSystem.COUNT, factor: '1', isBase: true },
  { code: 'H87', name: 'Piece', symbol: 'pc', system: UnitSystem.COUNT, factor: '1', isBase: false },
  { code: 'PR', name: 'Pair', symbol: 'pr', system: UnitSystem.COUNT, factor: '2', isBase: false },
  { code: 'DZN', name: 'Dozen', symbol: 'dz', system: UnitSystem.COUNT, factor: '12', isBase: false },
  { code: 'GRO', name: 'Gross', symbol: 'gr', system: UnitSystem.COUNT, factor: '144', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // TIME (Base: SEC - Second)
  // ─────────────────────────────────────────────────────────────
  { code: 'SEC', name: 'Second', symbol: 's', system: UnitSystem.TIME, factor: '1', isBase: true },
  { code: 'MIN', name: 'Minute', symbol: 'min', system: UnitSystem.TIME, factor: '60', isBase: false },
  { code: 'HUR', name: 'Hour', symbol: 'h', system: UnitSystem.TIME, factor: '3600', isBase: false },
  { code: 'DAY', name: 'Day', symbol: 'd', system: UnitSystem.TIME, factor: '86400', isBase: false },
  { code: 'WEE', name: 'Week', symbol: 'wk', system: UnitSystem.TIME, factor: '604800', isBase: false },
  { code: 'MON', name: 'Month', symbol: 'mo', system: UnitSystem.TIME, factor: '2629746', isBase: false },
  { code: 'ANN', name: 'Year', symbol: 'yr', system: UnitSystem.TIME, factor: '31556952', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // ENERGY (Base: JOU - Joule)
  // ─────────────────────────────────────────────────────────────
  { code: 'JOU', name: 'Joule', symbol: 'J', system: UnitSystem.ENERGY, factor: '1', isBase: true },
  { code: 'KJO', name: 'Kilojoule', symbol: 'kJ', system: UnitSystem.ENERGY, factor: '1000', isBase: false },
  { code: 'WHR', name: 'Watt hour', symbol: 'Wh', system: UnitSystem.ENERGY, factor: '3600', isBase: false },
  { code: 'KWH', name: 'Kilowatt hour', symbol: 'kWh', system: UnitSystem.ENERGY, factor: '3600000', isBase: false },
  { code: 'K3', name: 'Kilocalorie', symbol: 'kcal', system: UnitSystem.ENERGY, factor: '4184', isBase: false },

  // ─────────────────────────────────────────────────────────────
  // CURRENCY (Base: EUR - Euro, placeholder factors)
  // Note: Currency conversion requires live rates, these are placeholders
  // ─────────────────────────────────────────────────────────────
  { code: 'EUR', name: 'Euro', symbol: '€', system: UnitSystem.CURRENCY, factor: '1', isBase: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', system: UnitSystem.CURRENCY, factor: '1.08', isBase: false },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', system: UnitSystem.CURRENCY, factor: '0.86', isBase: false },
];

/**
 * Get units filtered by system.
 */
export function getUnitsBySystem(system: UnitSystem): UnitSeedData[] {
  return uneceUnits.filter(u => u.system === system);
}

/**
 * Get a unit by its UNECE code.
 */
export function getUnitByCode(code: string): UnitSeedData | undefined {
  return uneceUnits.find(u => u.code === code);
}
