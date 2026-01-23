import { UnitDefinition } from '../entities/UnitDefinition.js';
import { UnitSystem } from '../entities/enums/index.js';

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

export interface UnitLookup {
  findUnit(code: string): Promise<UnitDefinition | null>;
  findBaseUnit(system: UnitSystem): Promise<UnitDefinition | null>;
}

export interface ConversionResult {
  val: number;
  unit: string;
}

export class UnitConversionService {
  constructor(private readonly lookup: UnitLookup) {}

  /**
   * Convert a value from one unit to another within the same system.
   */
  async convert(value: number, fromUnit: string, toUnit: string): Promise<ConversionResult> {
    const from = await this.lookup.findUnit(fromUnit);
    if (!from) {
      throw new ConversionError(`Unit not found: ${fromUnit}`);
    }

    const to = await this.lookup.findUnit(toUnit);
    if (!to) {
      throw new ConversionError(`Unit not found: ${toUnit}`);
    }

    if (from.system !== to.system) {
      throw new ConversionError(
        `Cannot convert between different unit systems: ${from.system} and ${to.system}`
      );
    }

    // Convert: value * fromFactor / toFactor
    const fromFactor = parseFloat(from.factor);
    const toFactor = parseFloat(to.factor);
    const converted = (value * fromFactor) / toFactor;

    return { val: converted, unit: toUnit };
  }

  /**
   * Convert to the base unit of the system.
   */
  async toBase(value: number, fromUnit: string): Promise<ConversionResult> {
    const from = await this.lookup.findUnit(fromUnit);
    if (!from) {
      throw new ConversionError(`Unit not found: ${fromUnit}`);
    }

    const baseUnit = await this.lookup.findBaseUnit(from.system);
    if (!baseUnit) {
      throw new ConversionError(`No base unit found for system: ${from.system}`);
    }

    return this.convert(value, fromUnit, baseUnit.code);
  }

  /**
   * Convert from base unit to target unit.
   */
  async fromBase(value: number, system: UnitSystem, toUnit: string): Promise<ConversionResult> {
    const baseUnit = await this.lookup.findBaseUnit(system);
    if (!baseUnit) {
      throw new ConversionError(`No base unit found for system: ${system}`);
    }

    return this.convert(value, baseUnit.code, toUnit);
  }
}
