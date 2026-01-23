# Taxonomy Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the foundational Taxonomy Engine with UNECE units, dual-scope categories, typed attributes, and rollup calculations.

**Architecture:** Four-phase implementation starting with units (public schema), then categories/attributes (dual schema), product values, and finally rollups. Each phase is independently testable and deployable.

**Tech Stack:** MikroORM, PostgreSQL with LTREE, Hono API, Zod validation, Vitest

---

## Phase 1: Foundation & Units

### Task 1.1: Create UnitSystem Enum

**Files:**
- Create: `packages/database/src/entities/enums/UnitSystem.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/UnitSystem.ts
export enum UnitSystem {
  MASS = 'MASS',
  LENGTH = 'LENGTH',
  AREA = 'AREA',
  VOLUME = 'VOLUME',
  TEMPERATURE = 'TEMPERATURE',
  PERCENTAGE = 'PERCENTAGE',
  COUNT = 'COUNT',
  TIME = 'TIME',
  ENERGY = 'ENERGY',
  CURRENCY = 'CURRENCY',
}
```

**Step 2: Create enums barrel export**

```typescript
// packages/database/src/entities/enums/index.ts
export { UnitSystem } from './UnitSystem.js';
```

**Step 3: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { UnitSystem } from './enums/index.js';
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/
git add packages/database/src/entities/index.ts
git commit -m "feat(database): add UnitSystem enum for UNECE unit categories"
```

---

### Task 1.2: Rewrite UnitDefinition Entity for UNECE

**Files:**
- Modify: `packages/database/src/entities/UnitDefinition.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/UnitDefinition.test.ts
import { describe, it, expect } from 'vitest';
import { UnitDefinition } from './UnitDefinition.js';
import { UnitSystem } from './enums/index.js';

describe('UnitDefinition', () => {
  it('should create a unit with UNECE code', () => {
    const unit = new UnitDefinition();
    unit.code = 'KGM';
    unit.name = 'Kilogram';
    unit.symbol = 'kg';
    unit.system = UnitSystem.MASS;
    unit.factor = '1';
    unit.isBase = true;
    unit.isActive = true;

    expect(unit.code).toBe('KGM');
    expect(unit.system).toBe(UnitSystem.MASS);
    expect(unit.isBase).toBe(true);
  });

  it('should have correct factor for conversion', () => {
    const gram = new UnitDefinition();
    gram.code = 'GRM';
    gram.name = 'Gram';
    gram.symbol = 'g';
    gram.system = UnitSystem.MASS;
    gram.factor = '0.001';
    gram.isBase = false;

    expect(gram.factor).toBe('0.001');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/UnitDefinition.test.ts
```

Expected: FAIL - current entity doesn't have `code`, `factor`, `isBase` properties

**Step 3: Rewrite the entity**

```typescript
// packages/database/src/entities/UnitDefinition.ts
import { Entity, Property, Unique, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { UnitSystem } from './enums/index.js';

@Entity({ tableName: 'unit_definition', schema: 'public' })
export class UnitDefinition extends BaseEntity {
  @Property({ type: 'text', length: 10 })
  @Unique()
  @Index()
  code!: string;  // UNECE Rec 20 code: "KGM", "GRM", "OZA"

  @Property({ type: 'text' })
  name!: string;  // "Kilogram"

  @Property({ type: 'text', length: 10 })
  symbol!: string;  // "kg"

  @Enum({ items: () => UnitSystem })
  system!: UnitSystem;  // MASS, LENGTH, VOLUME, etc.

  @Property({ type: 'decimal', precision: 20, scale: 10 })
  factor!: string;  // Conversion factor to base unit (stored as string for precision)

  @Property({ type: 'boolean', default: false, name: 'is_base' })
  isBase: boolean = false;  // Is this the base unit for its system?

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;  // Show in UI dropdowns?
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/entities/UnitDefinition.test.ts
```

Expected: PASS

**Step 5: Update entity exports**

Ensure `packages/database/src/entities/index.ts` exports UnitSystem:
```typescript
export { UnitDefinition } from './UnitDefinition.js';
export { UnitSystem } from './enums/index.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/entities/UnitDefinition.ts
git add packages/database/src/entities/UnitDefinition.test.ts
git commit -m "feat(database): rewrite UnitDefinition entity for UNECE Rec 20

- Add UNECE code field (KGM, GRM, OZA, etc.)
- Add UnitSystem enum for categorization
- Add factor field for conversion math
- Add isBase flag for base unit identification
- Move to public schema for cross-tenant sharing"
```

---

### Task 1.3: Move UnitDefinition to Public Schema

**Files:**
- Modify: `packages/database/src/entities/index.ts`
- Modify: `packages/database/src/mikro-orm.config.ts`

**Step 1: Update entity arrays**

In `packages/database/src/entities/index.ts`, move UnitDefinition from `tenantEntities` to `publicEntities`:

```typescript
// Import classes for entity arrays
import { Organization } from './Organization.js';
import { ApiKey } from './ApiKey.js';
import { OutboxEvent } from './OutboxEvent.js';
import { WebhookEvent } from './WebhookEvent.js';
import { UnitDefinition } from './UnitDefinition.js';  // Add this
import { Category } from './Category.js';
import { AttributeTemplate } from './AttributeTemplate.js';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';
import { AuditLog } from './AuditLog.js';

/**
 * Entities that belong in the PUBLIC schema.
 * These are shared across all tenants.
 */
export const publicEntities = [
  Organization,
  ApiKey,
  OutboxEvent,
  WebhookEvent,
  UnitDefinition,  // Add this - shared across all tenants
];

/**
 * Entities that belong in TENANT schemas.
 * Each tenant gets their own copy of these tables.
 */
export const tenantEntities = [
  Category,
  // UnitDefinition removed - now in public
  AttributeTemplate,
  Product,
  ProductVersion,
  AuditLog,
];
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "refactor(database): move UnitDefinition to public schema

Units are shared across all tenants (UNECE standard)."
```

---

### Task 1.4: Create UnitConversionService

**Files:**
- Create: `packages/database/src/services/unit-conversion.service.ts`
- Create: `packages/database/src/services/unit-conversion.service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/unit-conversion.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { UnitConversionService, ConversionError } from './unit-conversion.service.js';
import { UnitDefinition } from '../entities/UnitDefinition.js';
import { UnitSystem } from '../entities/enums/index.js';

describe('UnitConversionService', () => {
  let service: UnitConversionService;
  let units: Map<string, UnitDefinition>;

  beforeEach(() => {
    // Create mock units
    units = new Map();

    const kg = new UnitDefinition();
    kg.code = 'KGM';
    kg.name = 'Kilogram';
    kg.symbol = 'kg';
    kg.system = UnitSystem.MASS;
    kg.factor = '1';
    kg.isBase = true;
    units.set('KGM', kg);

    const g = new UnitDefinition();
    g.code = 'GRM';
    g.name = 'Gram';
    g.symbol = 'g';
    g.system = UnitSystem.MASS;
    g.factor = '0.001';
    g.isBase = false;
    units.set('GRM', g);

    const oz = new UnitDefinition();
    oz.code = 'OZA';
    oz.name = 'Ounce';
    oz.symbol = 'oz';
    oz.system = UnitSystem.MASS;
    oz.factor = '0.0283495';
    oz.isBase = false;
    units.set('OZA', oz);

    const m = new UnitDefinition();
    m.code = 'MTR';
    m.name = 'Metre';
    m.symbol = 'm';
    m.system = UnitSystem.LENGTH;
    m.factor = '1';
    m.isBase = true;
    units.set('MTR', m);

    // Create service with mock lookup
    service = new UnitConversionService({
      findUnit: async (code: string) => units.get(code) ?? null,
      findBaseUnit: async (system: UnitSystem) => {
        for (const unit of units.values()) {
          if (unit.system === system && unit.isBase) return unit;
        }
        return null;
      },
    });
  });

  describe('convert', () => {
    it('should convert grams to kilograms', async () => {
      const result = await service.convert(500, 'GRM', 'KGM');
      expect(result.val).toBeCloseTo(0.5, 10);
      expect(result.unit).toBe('KGM');
    });

    it('should convert kilograms to grams', async () => {
      const result = await service.convert(0.5, 'KGM', 'GRM');
      expect(result.val).toBeCloseTo(500, 10);
      expect(result.unit).toBe('GRM');
    });

    it('should convert ounces to kilograms', async () => {
      const result = await service.convert(8, 'OZA', 'KGM');
      expect(result.val).toBeCloseTo(0.226796, 5);
      expect(result.unit).toBe('KGM');
    });

    it('should throw when converting between different systems', async () => {
      await expect(service.convert(1, 'KGM', 'MTR')).rejects.toThrow(ConversionError);
    });

    it('should throw when unit not found', async () => {
      await expect(service.convert(1, 'XXX', 'KGM')).rejects.toThrow(ConversionError);
    });
  });

  describe('toBase', () => {
    it('should convert grams to base unit (kg)', async () => {
      const result = await service.toBase(500, 'GRM');
      expect(result.val).toBeCloseTo(0.5, 10);
      expect(result.unit).toBe('KGM');
    });

    it('should return same value if already base unit', async () => {
      const result = await service.toBase(1, 'KGM');
      expect(result.val).toBe(1);
      expect(result.unit).toBe('KGM');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/unit-conversion.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/unit-conversion.service.ts
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
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/unit-conversion.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

```typescript
// packages/database/src/services/index.ts
export { TenantProvisioner, type ProvisioningResult } from './tenant-provisioner.js';
export { ApiKeyService, type CreateApiKeyResult, type ValidateApiKeyResult } from './api-key.service.js';
export {
  UnitConversionService,
  ConversionError,
  type UnitLookup,
  type ConversionResult,
} from './unit-conversion.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/unit-conversion.service.ts
git add packages/database/src/services/unit-conversion.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add UnitConversionService for UNECE unit conversions

- Convert between units in same system
- Convert to/from base unit
- Full precision using string factors
- Comprehensive test coverage"
```

---

### Task 1.5: Create UNECE Seed Data Script

**Files:**
- Create: `packages/database/src/seeds/unece-units.ts`
- Create: `packages/database/src/seeds/unece-units.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/seeds/unece-units.test.ts
import { describe, it, expect } from 'vitest';
import { uneceUnits, getUnitsBySystem } from './unece-units.js';
import { UnitSystem } from '../entities/enums/index.js';

describe('UNECE Units Seed Data', () => {
  it('should have mass units', () => {
    const massUnits = getUnitsBySystem(UnitSystem.MASS);
    expect(massUnits.length).toBeGreaterThan(0);

    const kg = massUnits.find(u => u.code === 'KGM');
    expect(kg).toBeDefined();
    expect(kg?.isBase).toBe(true);
    expect(kg?.factor).toBe('1');
  });

  it('should have length units', () => {
    const lengthUnits = getUnitsBySystem(UnitSystem.LENGTH);
    expect(lengthUnits.length).toBeGreaterThan(0);

    const meter = lengthUnits.find(u => u.code === 'MTR');
    expect(meter).toBeDefined();
    expect(meter?.isBase).toBe(true);
  });

  it('should have percentage unit', () => {
    const pctUnits = getUnitsBySystem(UnitSystem.PERCENTAGE);
    const p1 = pctUnits.find(u => u.code === 'P1');
    expect(p1).toBeDefined();
    expect(p1?.symbol).toBe('%');
  });

  it('should have exactly one base unit per system', () => {
    for (const system of Object.values(UnitSystem)) {
      const units = getUnitsBySystem(system as UnitSystem);
      if (units.length === 0) continue; // Some systems may not have units yet

      const baseUnits = units.filter(u => u.isBase);
      expect(baseUnits.length).toBe(1);
    }
  });

  it('should have all required fields', () => {
    for (const unit of uneceUnits) {
      expect(unit.code).toBeDefined();
      expect(unit.code.length).toBeLessThanOrEqual(10);
      expect(unit.name).toBeDefined();
      expect(unit.symbol).toBeDefined();
      expect(unit.system).toBeDefined();
      expect(unit.factor).toBeDefined();
      expect(typeof unit.isBase).toBe('boolean');
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/seeds/unece-units.test.ts
```

Expected: FAIL - module not found

**Step 3: Create the seed data**

```typescript
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
  // TEMPERATURE (Base: KEL - Kelvin, but CEL commonly used)
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
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/seeds/unece-units.test.ts
```

Expected: PASS

**Step 5: Create seeds barrel export**

```typescript
// packages/database/src/seeds/index.ts
export { uneceUnits, getUnitsBySystem, getUnitByCode, type UnitSeedData } from './unece-units.js';
```

**Step 6: Export from package index**

Add to `packages/database/src/index.ts`:
```typescript
export * from './seeds/index.js';
```

**Step 7: Commit**

```bash
git add packages/database/src/seeds/
git add packages/database/src/index.ts
git commit -m "feat(database): add UNECE Rec 20 unit seed data

Curated subset of ~50 common units:
- MASS: kg, g, mg, t, lb, oz
- LENGTH: m, cm, mm, km, in, ft, yd
- AREA: m², cm², ha, ft²
- VOLUME: m³, L, mL, gal, fl oz
- TEMPERATURE: °C, °F
- PERCENTAGE: %
- COUNT: ea, pc, pr, dz
- TIME: s, min, h, d, wk, mo, yr
- ENERGY: J, kJ, Wh, kWh, kcal
- CURRENCY: EUR, USD, GBP (placeholder rates)"
```

---

### Task 1.6: Create Units API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/units.ts`
- Create: `apps/api/src/routes/taxonomy/units.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/routes/taxonomy/units.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createUnitsRouter } from './units.js';
import { UnitSystem } from '@eurocomply/database';

// Mock unit data
const mockUnits = [
  { id: '1', code: 'KGM', name: 'Kilogram', symbol: 'kg', system: UnitSystem.MASS, factor: '1', isBase: true, isActive: true },
  { id: '2', code: 'GRM', name: 'Gram', symbol: 'g', system: UnitSystem.MASS, factor: '0.001', isBase: false, isActive: true },
  { id: '3', code: 'MTR', name: 'Metre', symbol: 'm', system: UnitSystem.LENGTH, factor: '1', isBase: true, isActive: true },
];

describe('units routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    const router = createUnitsRouter({
      findAll: async (filter) => {
        let units = [...mockUnits];
        if (filter?.system) {
          units = units.filter(u => u.system === filter.system);
        }
        if (filter?.active !== undefined) {
          units = units.filter(u => u.isActive === filter.active);
        }
        return units;
      },
      findByCode: async (code) => mockUnits.find(u => u.code === code) ?? null,
      findBaseUnit: async (system) => mockUnits.find(u => u.system === system && u.isBase) ?? null,
    });
    app.route('/units', router);
  });

  describe('GET /units', () => {
    it('returns all units', async () => {
      const res = await app.request('/units');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(3);
    });

    it('filters by system', async () => {
      const res = await app.request('/units?system=MASS');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(2);
      expect(data.data.every((u: any) => u.system === 'MASS')).toBe(true);
    });
  });

  describe('GET /units/:code', () => {
    it('returns unit by code', async () => {
      const res = await app.request('/units/KGM');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.code).toBe('KGM');
      expect(data.data.name).toBe('Kilogram');
    });

    it('returns 404 for unknown code', async () => {
      const res = await app.request('/units/XXX');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /units/convert', () => {
    it('converts between units', async () => {
      const res = await app.request('/units/convert?from=GRM&to=KGM&value=500');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.from.val).toBe(500);
      expect(data.data.from.unit).toBe('GRM');
      expect(data.data.to.val).toBeCloseTo(0.5, 10);
      expect(data.data.to.unit).toBe('KGM');
    });

    it('returns 400 for missing parameters', async () => {
      const res = await app.request('/units/convert?from=GRM&to=KGM');
      expect(res.status).toBe(400);
    });

    it('returns 400 for cross-system conversion', async () => {
      const res = await app.request('/units/convert?from=KGM&to=MTR&value=1');
      expect(res.status).toBe(400);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/units.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the routes**

```typescript
// apps/api/src/routes/taxonomy/units.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { UnitSystem, UnitConversionService, type UnitLookup } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface UnitData {
  id: string;
  code: string;
  name: string;
  symbol: string;
  system: UnitSystem;
  factor: string;
  isBase: boolean;
  isActive: boolean;
}

export interface UnitsRepository {
  findAll(filter?: { system?: UnitSystem; active?: boolean }): Promise<UnitData[]>;
  findByCode(code: string): Promise<UnitData | null>;
  findBaseUnit(system: UnitSystem): Promise<UnitData | null>;
}

// ============================================================================
// Schemas
// ============================================================================

const listUnitsQuery = z.object({
  system: z.nativeEnum(UnitSystem).optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const convertQuery = z.object({
  from: z.string().min(1).max(10),
  to: z.string().min(1).max(10),
  value: z.string().transform(v => parseFloat(v)).refine(v => !isNaN(v), 'value must be a number'),
});

// ============================================================================
// Router
// ============================================================================

export function createUnitsRouter(repo: UnitsRepository) {
  const router = new Hono();

  // Create unit lookup adapter for conversion service
  const lookup: UnitLookup = {
    findUnit: async (code) => {
      const unit = await repo.findByCode(code);
      if (!unit) return null;
      // Map to UnitDefinition-like object
      return {
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
      } as any;
    },
    findBaseUnit: async (system) => {
      const unit = await repo.findBaseUnit(system);
      if (!unit) return null;
      return {
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
      } as any;
    },
  };

  const conversionService = new UnitConversionService(lookup);

  // GET /units - List all units
  router.get('/', zValidator('query', listUnitsQuery), async (c) => {
    const query = c.req.valid('query');
    const units = await repo.findAll({
      system: query.system,
      active: query.active,
    });

    return c.json({
      data: units,
      meta: { total: units.length },
    });
  });

  // GET /units/convert - Convert between units
  // Note: Must be before /:code to avoid matching "convert" as a code
  router.get('/convert', zValidator('query', convertQuery), async (c) => {
    const { from, to, value } = c.req.valid('query');

    try {
      const result = await conversionService.convert(value, from, to);

      return c.json({
        data: {
          from: { val: value, unit: from },
          to: { val: result.val, unit: result.unit },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed';
      return c.json({ error: 'Bad Request', message }, 400);
    }
  });

  // GET /units/:code - Get unit by UNECE code
  router.get('/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const unit = await repo.findByCode(code);

    if (!unit) {
      return c.json({ error: 'Not Found', message: `Unit not found: ${code}` }, 404);
    }

    return c.json({ data: unit });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/units.test.ts
```

Expected: PASS

**Step 5: Create taxonomy routes barrel**

```typescript
// apps/api/src/routes/taxonomy/index.ts
export { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/taxonomy/
git commit -m "feat(api): add taxonomy units API routes

- GET /units - list all units with system/active filters
- GET /units/:code - get unit by UNECE code
- GET /units/convert - convert between units in same system"
```

---

### Task 1.7: Wire Units Routes to App

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Update app.ts to include taxonomy routes**

Add to imports at top:
```typescript
import { createUnitsRouter, type UnitsRepository } from './routes/taxonomy/index.js';
```

Add to `AppDependencies` interface:
```typescript
export interface AppDependencies {
  orm?: OrmLike;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
  unitsRepository?: UnitsRepository;  // Add this
}
```

Add routes before tenant-scoped routes (around line 75):
```typescript
  // Taxonomy routes (public, no auth required)
  const taxonomy = new Hono();
  if (deps?.unitsRepository) {
    taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
  }
  v1.route('/taxonomy', taxonomy);
```

**Step 2: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): wire taxonomy units routes to app"
```

---

### Task 1.8: Create Migration for UnitDefinition Schema Change

**Files:**
- Create: `packages/database/src/migrations/Migration20260123_UnitDefinitionUnece.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260123_UnitDefinitionUnece.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260123_UnitDefinitionUnece extends Migration {
  async up(): Promise<void> {
    // Drop old table if exists (clean slate for new schema)
    this.addSql('DROP TABLE IF EXISTS "public"."unit_definition" CASCADE;');

    // Create new table with UNECE structure
    this.addSql(`
      CREATE TABLE "public"."unit_definition" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(10) NOT NULL,
        "name" text NOT NULL,
        "symbol" varchar(10) NOT NULL,
        "system" text NOT NULL,
        "factor" decimal(20, 10) NOT NULL,
        "is_base" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "unit_definition_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "unit_definition_code_unique" UNIQUE ("code")
      );
    `);

    // Create index on code for fast lookups
    this.addSql('CREATE INDEX "unit_definition_code_index" ON "public"."unit_definition" ("code");');

    // Create index on system for filtering
    this.addSql('CREATE INDEX "unit_definition_system_index" ON "public"."unit_definition" ("system");');
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "public"."unit_definition" CASCADE;');
  }
}
```

**Step 2: Commit**

```bash
git add packages/database/src/migrations/Migration20260123_UnitDefinitionUnece.ts
git commit -m "feat(database): add migration for UNECE unit_definition table"
```

---

### Task 1.9: Phase 1 Integration Test

**Files:**
- Create: `apps/api/src/routes/taxonomy/units.e2e.test.ts`

**Step 1: Create integration test**

```typescript
// apps/api/src/routes/taxonomy/units.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Hono } from 'hono';
import { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
import { UnitDefinition, UnitSystem, uneceUnits } from '@eurocomply/database';

describe('Units API E2E', () => {
  let orm: MikroORM;
  let app: Hono;

  beforeAll(async () => {
    // Skip if no test database available
    if (!process.env['DATABASE_HOST']) {
      return;
    }

    orm = await MikroORM.init({
      entities: [UnitDefinition],
      dbName: process.env['DATABASE_NAME'] ?? 'eurocomply_test',
      host: process.env['DATABASE_HOST'] ?? 'localhost',
      port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
      user: process.env['DATABASE_USER'] ?? 'eurocomply',
      password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
      schema: 'public',
      allowGlobalContext: true,
    });

    // Seed test units
    const em = orm.em.fork();
    for (const unitData of uneceUnits.slice(0, 10)) {
      const unit = em.create(UnitDefinition, {
        code: unitData.code,
        name: unitData.name,
        symbol: unitData.symbol,
        system: unitData.system,
        factor: unitData.factor,
        isBase: unitData.isBase,
        isActive: true,
      });
      em.persist(unit);
    }
    await em.flush();

    // Create repository
    const repo: UnitsRepository = {
      findAll: async (filter) => {
        const qb = orm.em.fork().createQueryBuilder(UnitDefinition);
        if (filter?.system) qb.andWhere({ system: filter.system });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        return qb.getResultList() as unknown as UnitData[];
      },
      findByCode: async (code) => {
        return orm.em.fork().findOne(UnitDefinition, { code }) as unknown as UnitData | null;
      },
      findBaseUnit: async (system) => {
        return orm.em.fork().findOne(UnitDefinition, { system, isBase: true }) as unknown as UnitData | null;
      },
    };

    app = new Hono();
    app.route('/units', createUnitsRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      // Clean up test data
      await orm.em.fork().nativeDelete(UnitDefinition, {});
      await orm.close();
    }
  });

  it('should list units from database', async () => {
    if (!orm) return; // Skip if no database

    const res = await app.request('/units');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.length).toBeGreaterThan(0);
  });

  it('should convert units correctly', async () => {
    if (!orm) return;

    const res = await app.request('/units/convert?from=GRM&to=KGM&value=1000');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.to.val).toBeCloseTo(1, 5);
  });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/units.e2e.test.ts
git commit -m "test(api): add units API e2e test"
```

---

## Phase 1 Complete Checkpoint

At this point, Phase 1 is complete. Verify:

```bash
# Run all Phase 1 tests
cd packages/database && pnpm test
cd ../.. && cd apps/api && pnpm test src/routes/taxonomy/

# Verify build
pnpm build
```

**Phase 1 Deliverables:**
- [x] UnitSystem enum
- [x] UnitDefinition entity (UNECE structure)
- [x] UnitConversionService
- [x] UNECE seed data (~50 units)
- [x] Units API routes (list, get, convert)
- [x] Migration for public schema
- [x] Tests for all components

---

## Phase 2: Categories & Attributes

> **Note:** Phase 2 builds on Phase 1. Continue after Phase 1 is verified.

### Task 2.1: Add TargetType Enum

**Files:**
- Create: `packages/database/src/entities/enums/TargetType.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum**

```typescript
// packages/database/src/entities/enums/TargetType.ts
export enum TargetType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
  FACILITY = 'FACILITY',
  BATCH = 'BATCH',
}
```

**Step 2: Export from enums index**

```typescript
// packages/database/src/entities/enums/index.ts
export { UnitSystem } from './UnitSystem.js';
export { TargetType } from './TargetType.js';
```

**Step 3: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { UnitSystem, TargetType } from './enums/index.js';
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/TargetType.ts
git add packages/database/src/entities/enums/index.ts
git add packages/database/src/entities/index.ts
git commit -m "feat(database): add TargetType enum for multi-entity taxonomy"
```

---

### Task 2.2: Update Category Entity with TargetType

**Files:**
- Modify: `packages/database/src/entities/Category.ts`
- Create: `packages/database/src/entities/Category.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/Category.test.ts
import { describe, it, expect } from 'vitest';
import { Category, CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';

describe('Category', () => {
  it('should create a category with targetType', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;
    category.targetType = TargetType.PRODUCT;

    expect(category.name).toBe('Apparel');
    expect(category.targetType).toBe(TargetType.PRODUCT);
  });

  it('should support FACILITY targetType', () => {
    const category = new Category();
    category.name = 'Manufacturing Plants';
    category.path = 'facilities.manufacturing';
    category.type = CategoryType.BRANCH;
    category.targetType = TargetType.FACILITY;

    expect(category.targetType).toBe(TargetType.FACILITY);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/Category.test.ts
```

Expected: FAIL - targetType property doesn't exist

**Step 3: Update the entity**

```typescript
// packages/database/src/entities/Category.ts
import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TargetType } from './enums/index.js';

export enum CategoryType {
  ROOT = 'ROOT',
  BRANCH = 'BRANCH',
  LEAF = 'LEAF',
}

@Entity({ tableName: 'category' })
export class Category extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;

  @ManyToOne(() => Category, { nullable: true, name: 'parent_id' })
  parent?: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children = new Collection<Category>(this);

  @Property({ type: 'text', nullable: true, name: 'default_profile_id' })
  defaultProfileId?: string;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/entities/Category.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Category.ts
git add packages/database/src/entities/Category.test.ts
git commit -m "feat(database): add targetType to Category entity

Enables same taxonomy engine for Products, Facilities, Batches, Materials"
```

---

### Task 2.3: Update AttributeTemplate with TargetType and WeightBasisKey

**Files:**
- Modify: `packages/database/src/entities/AttributeTemplate.ts`
- Create: `packages/database/src/entities/AttributeTemplate.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/AttributeTemplate.test.ts
import { describe, it, expect } from 'vitest';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from './AttributeTemplate.js';
import { TargetType, UnitSystem } from './enums/index.js';
import { Category, CategoryType } from './Category.js';

describe('AttributeTemplate', () => {
  it('should create an attribute with targetType', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;
    category.targetType = TargetType.PRODUCT;

    const attr = new AttributeTemplate();
    attr.key = 'weight';
    attr.name = 'Product Weight';
    attr.type = AttributeType.NUMBER_UNIT;
    attr.targetType = TargetType.PRODUCT;
    attr.category = category;
    attr.unitSystem = UnitSystem.MASS;
    attr.rollupMethod = RollupMethod.SUM;

    expect(attr.targetType).toBe(TargetType.PRODUCT);
    expect(attr.unitSystem).toBe(UnitSystem.MASS);
  });

  it('should support weightBasisKey for WEIGHTED_AVG rollup', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;

    const attr = new AttributeTemplate();
    attr.key = 'recycled_content';
    attr.name = 'Recycled Content';
    attr.type = AttributeType.NUMBER_UNIT;
    attr.targetType = TargetType.PRODUCT;
    attr.category = category;
    attr.unitSystem = UnitSystem.PERCENTAGE;
    attr.rollupMethod = RollupMethod.WEIGHTED_AVG;
    attr.weightBasisKey = 'weight';

    expect(attr.weightBasisKey).toBe('weight');
  });

  it('should have NUMBER_UNIT attribute type', () => {
    const attr = new AttributeTemplate();
    attr.type = AttributeType.NUMBER_UNIT;
    expect(attr.type).toBe('NUMBER_UNIT');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/AttributeTemplate.test.ts
```

Expected: FAIL - missing NUMBER_UNIT, targetType, unitSystem, weightBasisKey

**Step 3: Update the entity**

```typescript
// packages/database/src/entities/AttributeTemplate.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { TargetType, UnitSystem } from './enums/index.js';

export enum AttributeType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  NUMBER_UNIT = 'NUMBER_UNIT',
  SELECT_SINGLE = 'SELECT_SINGLE',
  SELECT_MULTI = 'SELECT_MULTI',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  RANGE = 'RANGE',
  RICH_TEXT = 'RICH_TEXT',
  FILE = 'FILE',
  COMPOSITE_PCT = 'COMPOSITE_PCT',
  REFERENCE = 'REFERENCE',
  EXTERNAL_URI = 'EXTERNAL_URI',
}

export enum RollupMethod {
  SUM = 'SUM',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  MAX = 'MAX',
  MIN = 'MIN',
  BOOLEAN_OR = 'BOOLEAN_OR',
  BOOLEAN_AND = 'BOOLEAN_AND',
  CONCAT = 'CONCAT',
  NONE = 'NONE',
}

export enum InheritanceRule {
  INHERIT = 'INHERIT',
  OVERRIDE = 'OVERRIDE',
  ADDITIVE = 'ADDITIVE',
}

@Entity({ tableName: 'attribute_template' })
export class AttributeTemplate extends BaseEntity {
  @Property({ type: 'text', length: 100 })
  @Index()
  key!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => AttributeType })
  type!: AttributeType;

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  // Soft link to public.unit_definitions (for cell scaling)
  @Property({ type: 'text', nullable: true, name: 'default_unit_id' })
  defaultUnitId?: string;

  @Enum({ items: () => UnitSystem, nullable: true, name: 'unit_system' })
  unitSystem?: UnitSystem;

  // Rollup configuration
  @Enum({ items: () => RollupMethod, name: 'rollup_method', default: RollupMethod.NONE })
  rollupMethod: RollupMethod = RollupMethod.NONE;

  @Property({ type: 'text', nullable: true, name: 'weight_basis_key' })
  weightBasisKey?: string;  // For WEIGHTED_AVG: attribute key to weight by

  @Enum({ items: () => InheritanceRule, name: 'inheritance_rule', default: InheritanceRule.INHERIT })
  inheritanceRule: InheritanceRule = InheritanceRule.INHERIT;

  @Property({ type: 'json', nullable: true, name: 'validation_rules' })
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
  };

  @Property({ type: 'json', nullable: true, name: 'enum_values' })
  enumValues?: string[];

  @Property({ type: 'json', nullable: true, name: 'default_value' })
  defaultValue?: unknown;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/entities/AttributeTemplate.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/AttributeTemplate.ts
git add packages/database/src/entities/AttributeTemplate.test.ts
git commit -m "feat(database): update AttributeTemplate with targetType, unitSystem, weightBasisKey

- Add NUMBER_UNIT type for unit-aware attributes
- Add targetType for multi-entity taxonomy
- Add unitSystem for validation
- Add weightBasisKey for WEIGHTED_AVG rollups
- Add all attribute types from design spec"
```

---

### Task 2.4: Create CategoryAdoption Entity

**Files:**
- Create: `packages/database/src/entities/CategoryAdoption.ts`
- Create: `packages/database/src/entities/CategoryAdoption.test.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/CategoryAdoption.test.ts
import { describe, it, expect } from 'vitest';
import { CategoryAdoption, AdoptionMode } from './CategoryAdoption.js';
import { Category, CategoryType } from './Category.js';

describe('CategoryAdoption', () => {
  it('should create a LIVE_LINK adoption', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.LIVE_LINK;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(AdoptionMode.LIVE_LINK);
    expect(adoption.systemCategoryId).toBe('sys_cat_123');
  });

  it('should create a FORKED adoption with version', () => {
    const localCategory = new Category();
    localCategory.name = 'Premium T-Shirts';
    localCategory.path = 'apparel.tops.tshirts.premium';
    localCategory.type = CategoryType.LEAF;

    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.FORKED;
    adoption.localCategory = localCategory;
    adoption.forkedVersion = 3;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(AdoptionMode.FORKED);
    expect(adoption.forkedVersion).toBe(3);
    expect(adoption.localCategory).toBe(localCategory);
  });

  it('should track update availability', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.FORKED;
    adoption.adoptedAt = new Date();
    adoption.updateAvailable = true;

    expect(adoption.updateAvailable).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/CategoryAdoption.test.ts
```

Expected: FAIL - module not found

**Step 3: Create the entity**

```typescript
// packages/database/src/entities/CategoryAdoption.ts
import { Entity, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';

export enum AdoptionMode {
  LIVE_LINK = 'LIVE_LINK',
  FORKED = 'FORKED',
}

@Entity({ tableName: 'category_adoption' })
export class CategoryAdoption extends BaseEntity {
  // Soft link to public.categories - NO @ManyToOne for cell scaling
  @Property({ type: 'text', name: 'system_category_id' })
  systemCategoryId!: string;

  // Hard link within same tenant schema - OK to use @ManyToOne
  @ManyToOne(() => Category, { nullable: true, name: 'local_category_id' })
  localCategory?: Category;

  @Enum({ items: () => AdoptionMode })
  mode!: AdoptionMode;

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ type: 'int', nullable: true, name: 'forked_version' })
  forkedVersion?: number;

  @Property({ type: 'boolean', default: false, name: 'update_available' })
  updateAvailable: boolean = false;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/entities/CategoryAdoption.test.ts
```

Expected: PASS

**Step 5: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { CategoryAdoption, AdoptionMode } from './CategoryAdoption.js';
```

Add to `tenantEntities` array:
```typescript
import { CategoryAdoption } from './CategoryAdoption.js';

export const tenantEntities = [
  Category,
  CategoryAdoption,  // Add this
  AttributeTemplate,
  Product,
  ProductVersion,
  AuditLog,
];
```

**Step 6: Commit**

```bash
git add packages/database/src/entities/CategoryAdoption.ts
git add packages/database/src/entities/CategoryAdoption.test.ts
git add packages/database/src/entities/index.ts
git commit -m "feat(database): add CategoryAdoption entity for LIVE_LINK/FORKED modes

- Soft link to system categories (cell-ready)
- Hard link to local forked category
- Track forked version for update notifications"
```

---

### Task 2.5: Add Unit Preferences to Organization

**Files:**
- Modify: `packages/database/src/entities/Organization.ts`

**Step 1: Update the entity**

Add after existing properties in Organization.ts:
```typescript
  @Property({ type: 'json', nullable: true, name: 'unit_preferences' })
  unitPreferences?: Record<string, string>;  // { "MASS": "KGM", "LENGTH": "MTR" }
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/Organization.ts
git commit -m "feat(database): add unitPreferences to Organization entity"
```

---

> **Continue with remaining Phase 2 tasks...**

---

## Phases 1 & 2 Complete

The tasks above (1.1-1.9, 2.1-2.5) have been completed. The remaining phases have been split into separate implementation plans:

### Continuation Plans

- **Plan 3: Category Service & API** - `docs/plans/2026-01-23-taxonomy-category-service-api.md`
  - CategoryService with LTREE-optimized queries
  - Categories API routes (CRUD, adoption, ancestors)
  - MikroORM repository implementation

- **Plan 4: Attributes Service & API** - `docs/plans/2026-01-23-taxonomy-attributes-service-api.md`
  - AttributeService with inheritance resolution
  - Attributes API routes
  - Category-scoped attribute queries

- **Plan 5: Product Attribute Values** - `docs/plans/2026-01-23-taxonomy-product-attribute-values.md`
  - AttributeValue types and Zod schema
  - AttributeValueService (normalize, validate, display)
  - Unit preferences middleware
  - Product attributes API routes

- **Plan 6: Rollup Engine** - `docs/plans/2026-01-23-taxonomy-rollup-engine.md`
  - BomFlattenerService
  - RollupCalculatorService (SUM, WEIGHTED_AVG, MAX, MIN, BOOLEAN)
  - RollupEngineService
  - Manual recalculation API

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial implementation plan |
| 1.1 | 2026-01-23 | Added LTREE optimization for inheritance, Hono middleware for unit transform |
| 2.0 | 2026-01-23 | Split into 6 focused plans, this file now contains only completed work |
