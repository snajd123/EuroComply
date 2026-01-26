# Product Attribute Values Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement product attribute value storage, validation, and display with unit preferences support.

**Architecture:** Attribute values are stored on ProductVersion.data.attributes with dual-storage (input + normalized). Values are validated against AttributeTemplates. Display conversion uses unit preferences from Header > User > Org > System hierarchy.

**Tech Stack:** MikroORM, PostgreSQL, Hono, Zod validation, Vitest

**Prerequisites:**
- Plan 1 (Units Foundation) - DONE
- Plan 2 (Category & Attribute Schema) - DONE
- Plan 3 (Category Service & API) - DONE
- Plan 4 (Attributes Service & API) - DONE

---

## Task 5.1: Define Attribute Value Schema and Types

**Files:**
- Create: `packages/database/src/types/attribute-value.ts`
- Create: `packages/database/src/types/attribute-value.test.ts`
- Modify: `packages/database/src/types/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/types/attribute-value.test.ts
import { describe, it, expect } from 'vitest';
import {
  AttributeValueSchema,
  parseAttributeValue,
  validateAttributeValue,
  type AttributeValue,
  AttributeSource,
} from './attribute-value.js';

describe('AttributeValue schema', () => {
  describe('parseAttributeValue', () => {
    it('should parse a valid NUMBER_UNIT value', () => {
      const input = {
        templateId: 'attr_weight',
        inputVal: 8,
        inputUnit: 'OZA',
        val: 0.2267962,
        unit: 'KGM',
        source: 'MANUAL',
        updatedAt: '2026-01-23T10:30:00Z',
      };

      const result = parseAttributeValue(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.templateId).toBe('attr_weight');
        expect(result.data.inputVal).toBe(8);
        expect(result.data.val).toBe(0.2267962);
        expect(result.data.source).toBe('MANUAL');
      }
    });

    it('should parse a valid TEXT value', () => {
      const input = {
        templateId: 'attr_brand',
        val: 'Acme Corp',
        source: 'MANUAL',
        updatedAt: '2026-01-23T10:30:00Z',
      };

      const result = parseAttributeValue(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.val).toBe('Acme Corp');
      }
    });

    it('should reject invalid source', () => {
      const input = {
        templateId: 'attr_weight',
        val: 100,
        source: 'INVALID_SOURCE',
        updatedAt: '2026-01-23T10:30:00Z',
      };

      const result = parseAttributeValue(input);

      expect(result.success).toBe(false);
    });

    it('should require templateId', () => {
      const input = {
        val: 100,
        source: 'MANUAL',
        updatedAt: '2026-01-23T10:30:00Z',
      };

      const result = parseAttributeValue(input);

      expect(result.success).toBe(false);
    });
  });

  describe('validateAttributeValue', () => {
    it('should validate NUMBER_UNIT has unit when required', () => {
      const value: Partial<AttributeValue> = {
        val: 100,
        // Missing unit
      };

      const errors = validateAttributeValue(value, {
        type: 'NUMBER_UNIT',
        unitSystem: 'MASS',
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('unit');
    });

    it('should validate min/max constraints', () => {
      const value: Partial<AttributeValue> = {
        val: -5,
        unit: 'KGM',
      };

      const errors = validateAttributeValue(value, {
        type: 'NUMBER_UNIT',
        unitSystem: 'MASS',
        validationRules: { min: 0, max: 100 },
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('min');
    });

    it('should pass valid value', () => {
      const value: Partial<AttributeValue> = {
        val: 50,
        unit: 'KGM',
      };

      const errors = validateAttributeValue(value, {
        type: 'NUMBER_UNIT',
        unitSystem: 'MASS',
        validationRules: { min: 0, max: 100 },
      });

      expect(errors).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/types/attribute-value.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the types and schema**

```typescript
// packages/database/src/types/attribute-value.ts
import { z } from 'zod';

/**
 * Source of an attribute value - tracks how the value was set.
 */
export enum AttributeSource {
  MANUAL = 'MANUAL',
  INHERITED = 'INHERITED',
  CALCULATED = 'CALCULATED',
  IMPORTED = 'IMPORTED',
  CANNOT_CALCULATE = 'CANNOT_CALCULATE',
}

/**
 * Attribute value stored on ProductVersion.data.attributes
 *
 * Uses dual-storage pattern to preserve precision:
 * - inputVal/inputUnit: What user entered (preserved exactly)
 * - val/unit: Normalized for math & regulatory export
 */
export interface AttributeValue {
  /** Reference to the AttributeTemplate */
  templateId: string;

  /** What user entered (preserved exactly) */
  inputVal?: number | string | boolean | unknown[];
  inputUnit?: string;

  /** Normalized value for math & regulatory export */
  val: number | string | boolean | unknown[] | null;
  unit?: string;

  /** How this value was set */
  source: AttributeSource;

  /** When value was last updated */
  updatedAt: string;

  /** Optional: calculation warning if CALCULATED with issues */
  calculationWarning?: string;
}

/**
 * Zod schema for validating AttributeValue objects.
 */
export const AttributeValueSchema = z.object({
  templateId: z.string().min(1),
  inputVal: z.union([z.number(), z.string(), z.boolean(), z.array(z.unknown())]).optional(),
  inputUnit: z.string().optional(),
  val: z.union([z.number(), z.string(), z.boolean(), z.array(z.unknown()), z.null()]),
  unit: z.string().optional(),
  source: z.nativeEnum(AttributeSource),
  updatedAt: z.string().datetime(),
  calculationWarning: z.string().optional(),
});

/**
 * Schema for the attributes object on ProductVersion.data
 */
export const ProductAttributesSchema = z.record(z.string(), AttributeValueSchema);

export type ProductAttributes = z.infer<typeof ProductAttributesSchema>;

/**
 * Parse and validate an attribute value object.
 */
export function parseAttributeValue(input: unknown): z.SafeParseReturnType<unknown, AttributeValue> {
  return AttributeValueSchema.safeParse(input);
}

/**
 * Template info needed for validation.
 */
export interface AttributeTemplateInfo {
  type: string;
  unitSystem?: string;
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
  };
  enumValues?: string[];
}

/**
 * Validate an attribute value against its template.
 * Returns array of error messages (empty if valid).
 */
export function validateAttributeValue(
  value: Partial<AttributeValue>,
  template: AttributeTemplateInfo,
): string[] {
  const errors: string[] = [];

  // Check unit required for NUMBER_UNIT
  if (template.type === 'NUMBER_UNIT') {
    if (!value.unit) {
      errors.push(`unit is required for NUMBER_UNIT attributes`);
    }
  }

  // Check min/max for numeric values
  if (typeof value.val === 'number' && template.validationRules) {
    const { min, max } = template.validationRules;
    if (min !== undefined && value.val < min) {
      errors.push(`value must be >= ${min} (got ${value.val})`);
    }
    if (max !== undefined && value.val > max) {
      errors.push(`value must be <= ${max} (got ${value.val})`);
    }
  }

  // Check pattern for string values
  if (typeof value.val === 'string' && template.validationRules?.pattern) {
    const regex = new RegExp(template.validationRules.pattern);
    if (!regex.test(value.val)) {
      errors.push(`value does not match pattern: ${template.validationRules.pattern}`);
    }
  }

  // Check enum values
  if (template.enumValues && template.enumValues.length > 0) {
    if (typeof value.val === 'string' && !template.enumValues.includes(value.val)) {
      errors.push(`value must be one of: ${template.enumValues.join(', ')}`);
    }
    if (Array.isArray(value.val)) {
      const invalidValues = value.val.filter(v => typeof v === 'string' && !template.enumValues!.includes(v));
      if (invalidValues.length > 0) {
        errors.push(`invalid enum values: ${invalidValues.join(', ')}`);
      }
    }
  }

  return errors;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/types/attribute-value.test.ts
```

Expected: PASS

**Step 5: Export from types index**

Create or update `packages/database/src/types/index.ts`:

```typescript
export {
  AttributeSource,
  AttributeValueSchema,
  ProductAttributesSchema,
  parseAttributeValue,
  validateAttributeValue,
  type AttributeValue,
  type ProductAttributes,
  type AttributeTemplateInfo,
} from './attribute-value.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/types/attribute-value.ts
git add packages/database/src/types/attribute-value.test.ts
git add packages/database/src/types/index.ts
git commit -m "feat(database): add AttributeValue types and validation

- AttributeSource enum for tracking value origin
- Dual-storage pattern (input + normalized)
- Zod schema for validation
- Template-based validation rules"
```

---

## Task 5.2: Create AttributeValueService

**Files:**
- Create: `packages/database/src/services/attribute-value.service.ts`
- Create: `packages/database/src/services/attribute-value.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/attribute-value.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AttributeValueService } from './attribute-value.service.js';
import { AttributeSource, type AttributeValue } from '../types/attribute-value.js';

describe('AttributeValueService', () => {
  let service: AttributeValueService;

  beforeEach(() => {
    // Mock unit conversion
    const mockUnitConverter = {
      convert: async (value: number, fromUnit: string, toUnit: string) => {
        // Mock conversion: GRM to KGM
        if (fromUnit === 'GRM' && toUnit === 'KGM') {
          return { val: value * 0.001, unit: toUnit };
        }
        if (fromUnit === 'OZA' && toUnit === 'KGM') {
          return { val: value * 0.0283495, unit: toUnit };
        }
        return { val: value, unit: toUnit };
      },
      getBaseUnit: async (system: string) => {
        const baseUnits: Record<string, string> = {
          MASS: 'KGM',
          LENGTH: 'MTR',
          PERCENTAGE: 'P1',
        };
        return baseUnits[system] ?? null;
      },
    };

    // Mock template repository
    const mockTemplateRepo = {
      findById: async (id: string) => {
        const templates: Record<string, unknown> = {
          'attr_weight': {
            id: 'attr_weight',
            key: 'weight',
            type: 'NUMBER_UNIT',
            unitSystem: 'MASS',
            validationRules: { min: 0, max: 10000 },
          },
          'attr_brand': {
            id: 'attr_brand',
            key: 'brand',
            type: 'STRING',
          },
        };
        return templates[id] ?? null;
      },
    };

    service = new AttributeValueService(mockUnitConverter, mockTemplateRepo);
  });

  describe('normalizeValue', () => {
    it('should normalize NUMBER_UNIT to base unit', async () => {
      const result = await service.normalizeValue(
        'attr_weight',
        500,
        'GRM',
      );

      expect(result.inputVal).toBe(500);
      expect(result.inputUnit).toBe('GRM');
      expect(result.val).toBeCloseTo(0.5, 5);
      expect(result.unit).toBe('KGM');
      expect(result.source).toBe(AttributeSource.MANUAL);
    });

    it('should preserve string values without conversion', async () => {
      const result = await service.normalizeValue(
        'attr_brand',
        'Acme Corp',
        undefined,
      );

      expect(result.val).toBe('Acme Corp');
      expect(result.unit).toBeUndefined();
    });

    it('should throw for unknown template', async () => {
      await expect(
        service.normalizeValue('unknown_template', 100, 'KGM'),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('validateValue', () => {
    it('should validate NUMBER_UNIT value', async () => {
      const errors = await service.validateValue('attr_weight', 500, 'GRM');

      expect(errors).toHaveLength(0);
    });

    it('should reject value below min', async () => {
      const errors = await service.validateValue('attr_weight', -10, 'GRM');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('min');
    });

    it('should reject NUMBER_UNIT without unit', async () => {
      const errors = await service.validateValue('attr_weight', 500, undefined);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('unit');
    });
  });

  describe('convertForDisplay', () => {
    it('should convert to preferred unit', async () => {
      const value: AttributeValue = {
        templateId: 'attr_weight',
        inputVal: 500,
        inputUnit: 'GRM',
        val: 0.5,
        unit: 'KGM',
        source: AttributeSource.MANUAL,
        updatedAt: '2026-01-23T00:00:00Z',
      };

      const result = await service.convertForDisplay(value, { MASS: 'GRM' });

      expect(result.displayVal).toBeCloseTo(500, 5);
      expect(result.displayUnit).toBe('GRM');
      expect(result.displayLabel).toBe('500 GRM');
    });

    it('should return original when no preference set', async () => {
      const value: AttributeValue = {
        templateId: 'attr_weight',
        val: 0.5,
        unit: 'KGM',
        source: AttributeSource.MANUAL,
        updatedAt: '2026-01-23T00:00:00Z',
      };

      const result = await service.convertForDisplay(value, {});

      expect(result.displayVal).toBe(0.5);
      expect(result.displayUnit).toBe('KGM');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/attribute-value.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/attribute-value.service.ts
import { AttributeSource, type AttributeValue, validateAttributeValue } from '../types/attribute-value.js';

/**
 * Interface for unit conversion operations.
 */
export interface UnitConverter {
  convert(value: number, fromUnit: string, toUnit: string): Promise<{ val: number; unit: string }>;
  getBaseUnit(system: string): Promise<string | null>;
}

/**
 * Interface for accessing attribute templates.
 */
export interface TemplateRepository {
  findById(id: string): Promise<{
    id: string;
    key: string;
    type: string;
    unitSystem?: string;
    validationRules?: Record<string, unknown>;
    enumValues?: string[];
  } | null>;
}

/**
 * Display-ready attribute value with converted units.
 */
export interface DisplayAttributeValue extends AttributeValue {
  displayVal: number | string | boolean | unknown[] | null;
  displayUnit?: string;
  displayLabel?: string;
  _stored: { val: number | string | boolean | unknown[] | null; unit?: string };
}

/**
 * Service for attribute value operations.
 *
 * Handles:
 * - Normalization (input -> base unit)
 * - Validation against templates
 * - Display conversion (base unit -> preferred unit)
 */
export class AttributeValueService {
  constructor(
    private readonly unitConverter: UnitConverter,
    private readonly templateRepo: TemplateRepository,
  ) {}

  /**
   * Normalize an input value to base unit storage format.
   *
   * For NUMBER_UNIT types:
   * - Preserves inputVal/inputUnit exactly as entered
   * - Converts to base unit for val/unit
   */
  async normalizeValue(
    templateId: string,
    inputValue: number | string | boolean | unknown[],
    inputUnit: string | undefined,
    source: AttributeSource = AttributeSource.MANUAL,
  ): Promise<AttributeValue> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const now = new Date().toISOString();

    // For non-unit types, store value directly
    if (template.type !== 'NUMBER_UNIT' || !template.unitSystem) {
      return {
        templateId,
        val: inputValue,
        source,
        updatedAt: now,
      };
    }

    // For NUMBER_UNIT, normalize to base unit
    if (typeof inputValue !== 'number') {
      throw new Error(`NUMBER_UNIT requires numeric value, got ${typeof inputValue}`);
    }

    if (!inputUnit) {
      throw new Error(`NUMBER_UNIT requires unit`);
    }

    const baseUnit = await this.unitConverter.getBaseUnit(template.unitSystem);
    if (!baseUnit) {
      throw new Error(`No base unit found for system: ${template.unitSystem}`);
    }

    const converted = await this.unitConverter.convert(inputValue, inputUnit, baseUnit);

    return {
      templateId,
      inputVal: inputValue,
      inputUnit,
      val: converted.val,
      unit: converted.unit,
      source,
      updatedAt: now,
    };
  }

  /**
   * Validate a value against its template.
   * Returns array of error messages (empty if valid).
   */
  async validateValue(
    templateId: string,
    value: number | string | boolean | unknown[],
    unit: string | undefined,
  ): Promise<string[]> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      return [`Template not found: ${templateId}`];
    }

    return validateAttributeValue(
      { val: value, unit },
      {
        type: template.type,
        unitSystem: template.unitSystem,
        validationRules: template.validationRules as { min?: number; max?: number; pattern?: string; required?: boolean },
        enumValues: template.enumValues,
      },
    );
  }

  /**
   * Convert a stored value for display using unit preferences.
   *
   * Preference hierarchy: Header > User > Org > System default
   */
  async convertForDisplay(
    value: AttributeValue,
    unitPreferences: Record<string, string>,
  ): Promise<DisplayAttributeValue> {
    const template = await this.templateRepo.findById(value.templateId);

    // Store original for transparency
    const stored = { val: value.val, unit: value.unit };

    // For non-unit types, return as-is
    if (!template || template.type !== 'NUMBER_UNIT' || !template.unitSystem || !value.unit) {
      return {
        ...value,
        displayVal: value.val,
        displayUnit: value.unit,
        displayLabel: this.formatLabel(value.val, value.unit),
        _stored: stored,
      };
    }

    // Check for unit preference
    const preferredUnit = unitPreferences[template.unitSystem];

    if (!preferredUnit || preferredUnit === value.unit) {
      return {
        ...value,
        displayVal: value.val,
        displayUnit: value.unit,
        displayLabel: this.formatLabel(value.val, value.unit),
        _stored: stored,
      };
    }

    // Convert to preferred unit
    if (typeof value.val !== 'number') {
      return {
        ...value,
        displayVal: value.val,
        displayUnit: value.unit,
        displayLabel: this.formatLabel(value.val, value.unit),
        _stored: stored,
      };
    }

    const converted = await this.unitConverter.convert(value.val, value.unit, preferredUnit);

    return {
      ...value,
      displayVal: converted.val,
      displayUnit: converted.unit,
      displayLabel: this.formatLabel(converted.val, converted.unit),
      _stored: stored,
    };
  }

  /**
   * Format a value and unit into a display label.
   */
  private formatLabel(
    val: number | string | boolean | unknown[] | null,
    unit?: string,
  ): string {
    if (val === null) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return val.join(', ');
    if (unit) return `${val} ${unit}`;
    return String(val);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/attribute-value.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export {
  AttributeValueService,
  type UnitConverter,
  type TemplateRepository,
  type DisplayAttributeValue,
} from './attribute-value.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/attribute-value.service.ts
git add packages/database/src/services/attribute-value.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add AttributeValueService

- normalizeValue() converts to base unit storage
- validateValue() checks against template rules
- convertForDisplay() applies unit preferences"
```

---

## Task 5.3: Create Unit Preference Resolution Service

**Files:**
- Create: `packages/database/src/services/unit-preference.service.ts`
- Create: `packages/database/src/services/unit-preference.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/unit-preference.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { UnitPreferenceService } from './unit-preference.service.js';

describe('UnitPreferenceService', () => {
  let service: UnitPreferenceService;

  beforeEach(() => {
    // Mock preference repository
    const mockRepo = {
      getOrgPreferences: async (orgId: string) => {
        if (orgId === 'org_us') return { MASS: 'LBR', LENGTH: 'INH' };
        return { MASS: 'KGM', LENGTH: 'MTR' };
      },
      getUserPreferences: async (userId: string, orgId: string) => {
        if (userId === 'user_metric') return { MASS: 'GRM' };
        return null;
      },
    };

    service = new UnitPreferenceService(mockRepo);
  });

  describe('resolvePreferences', () => {
    it('should use header preferences first', async () => {
      const result = await service.resolvePreferences({
        headerPreferences: { MASS: 'OZA' },
        userId: 'user_1',
        orgId: 'org_us',
      });

      expect(result.MASS).toBe('OZA');
    });

    it('should fall back to user preferences', async () => {
      const result = await service.resolvePreferences({
        userId: 'user_metric',
        orgId: 'org_us',
      });

      expect(result.MASS).toBe('GRM');
    });

    it('should fall back to org preferences', async () => {
      const result = await service.resolvePreferences({
        userId: 'user_1',
        orgId: 'org_us',
      });

      expect(result.MASS).toBe('LBR');
      expect(result.LENGTH).toBe('INH');
    });

    it('should merge preferences from different levels', async () => {
      const result = await service.resolvePreferences({
        headerPreferences: { TEMPERATURE: 'FAH' },
        userId: 'user_metric',
        orgId: 'org_us',
      });

      // Header wins for TEMPERATURE
      expect(result.TEMPERATURE).toBe('FAH');
      // User wins for MASS (GRM overrides org's LBR)
      expect(result.MASS).toBe('GRM');
      // Org provides LENGTH (user didn't set it)
      expect(result.LENGTH).toBe('INH');
    });
  });

  describe('parseHeaderPreferences', () => {
    it('should parse X-Unit-Preferences header', () => {
      const header = 'MASS=OZA,LENGTH=INH,TEMPERATURE=FAH';

      const result = service.parseHeaderPreferences(header);

      expect(result).toEqual({
        MASS: 'OZA',
        LENGTH: 'INH',
        TEMPERATURE: 'FAH',
      });
    });

    it('should handle empty header', () => {
      const result = service.parseHeaderPreferences('');

      expect(result).toEqual({});
    });

    it('should ignore malformed entries', () => {
      const header = 'MASS=KGM,INVALID,LENGTH=MTR';

      const result = service.parseHeaderPreferences(header);

      expect(result).toEqual({
        MASS: 'KGM',
        LENGTH: 'MTR',
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/unit-preference.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/unit-preference.service.ts

/**
 * Interface for accessing stored unit preferences.
 */
export interface PreferenceRepository {
  getOrgPreferences(orgId: string): Promise<Record<string, string> | null>;
  getUserPreferences(userId: string, orgId: string): Promise<Record<string, string> | null>;
}

/**
 * Context for resolving unit preferences.
 */
export interface PreferenceContext {
  headerPreferences?: Record<string, string>;
  userId?: string;
  orgId?: string;
}

/**
 * Service for resolving unit preferences.
 *
 * Preference hierarchy (highest to lowest):
 * 1. Request Header (X-Unit-Preferences)
 * 2. User preferences
 * 3. Organization preferences
 * 4. System defaults (not implemented here - caller provides fallback)
 */
export class UnitPreferenceService {
  constructor(private readonly repo: PreferenceRepository) {}

  /**
   * Resolve unit preferences for a request context.
   *
   * Returns merged preferences with higher-priority sources overriding lower.
   */
  async resolvePreferences(context: PreferenceContext): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};

    // Start with org preferences (lowest priority)
    if (context.orgId) {
      const orgPrefs = await this.repo.getOrgPreferences(context.orgId);
      if (orgPrefs) {
        Object.assign(merged, orgPrefs);
      }
    }

    // Override with user preferences
    if (context.userId && context.orgId) {
      const userPrefs = await this.repo.getUserPreferences(context.userId, context.orgId);
      if (userPrefs) {
        Object.assign(merged, userPrefs);
      }
    }

    // Override with header preferences (highest priority)
    if (context.headerPreferences) {
      Object.assign(merged, context.headerPreferences);
    }

    return merged;
  }

  /**
   * Parse the X-Unit-Preferences header.
   *
   * Format: "MASS=KGM,LENGTH=MTR,TEMPERATURE=CEL"
   */
  parseHeaderPreferences(header: string | undefined | null): Record<string, string> {
    if (!header) return {};

    const preferences: Record<string, string> = {};

    const pairs = header.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        preferences[key.trim()] = value.trim();
      }
    }

    return preferences;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/unit-preference.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export {
  UnitPreferenceService,
  type PreferenceRepository,
  type PreferenceContext,
} from './unit-preference.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/unit-preference.service.ts
git add packages/database/src/services/unit-preference.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add UnitPreferenceService

- Resolves Header > User > Org preference hierarchy
- Parses X-Unit-Preferences header format
- Merges preferences from multiple levels"
```

---

## Task 5.4: Create Product Attributes API Routes

**Files:**
- Create: `apps/api/src/routes/products/attributes.ts`
- Create: `apps/api/src/routes/products/attributes.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/routes/products/attributes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createProductAttributesRouter, type ProductAttributesRepository } from './attributes.js';
import { AttributeSource } from '@eurocomply/database';

const mockAttributeValues = {
  weight: {
    templateId: 'attr_weight',
    inputVal: 500,
    inputUnit: 'GRM',
    val: 0.5,
    unit: 'KGM',
    source: AttributeSource.MANUAL,
    updatedAt: '2026-01-23T00:00:00Z',
  },
  recycled_content: {
    templateId: 'attr_recycled',
    val: 45,
    unit: 'P1',
    source: AttributeSource.CALCULATED,
    updatedAt: '2026-01-23T00:00:00Z',
  },
};

describe('product attributes routes', () => {
  let app: Hono;
  let mockRepo: ProductAttributesRepository;

  beforeEach(() => {
    mockRepo = {
      getAttributes: async (productId, versionId, keys) => {
        let attrs = { ...mockAttributeValues };
        if (keys && keys.length > 0) {
          attrs = Object.fromEntries(
            Object.entries(attrs).filter(([key]) => keys.includes(key))
          );
        }
        return attrs;
      },
      setAttributes: async (productId, versionId, values) => {
        return { ...mockAttributeValues, ...values };
      },
      getAttributeHistory: async (productId, key) => {
        return [mockAttributeValues.weight];
      },
    };

    app = new Hono();
    const router = new Hono();
    router.route('/:productId/versions/:versionId/attributes', createProductAttributesRouter(mockRepo));
    app.route('/products', router);
  });

  describe('GET /products/:productId/versions/:versionId/attributes', () => {
    it('returns all attribute values', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data.weight).toBeDefined();
      expect(body.data.recycled_content).toBeDefined();
    });

    it('filters by keys query param', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes?keys=weight');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data.weight).toBeDefined();
      expect(body.data.recycled_content).toBeUndefined();
    });
  });

  describe('PATCH /products/:productId/versions/:versionId/attributes', () => {
    it('updates multiple attributes', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: { val: 600, unit: 'GRM' },
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data.weight).toBeDefined();
    });

    it('rejects invalid body', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'not an object with val' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/products/attributes.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the routes**

```typescript
// apps/api/src/routes/products/attributes.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { type AttributeValue, AttributeSource } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface ProductAttributesRepository {
  getAttributes(
    productId: string,
    versionId: string,
    keys?: string[],
  ): Promise<Record<string, AttributeValue>>;

  setAttributes(
    productId: string,
    versionId: string,
    values: Record<string, { val: unknown; unit?: string }>,
  ): Promise<Record<string, AttributeValue>>;

  getAttributeHistory(
    productId: string,
    key: string,
  ): Promise<AttributeValue[]>;
}

// ============================================================================
// Schemas
// ============================================================================

const getAttributesQuery = z.object({
  keys: z.string().transform(s => s.split(',')).optional(),
});

const setAttributeValue = z.object({
  val: z.unknown(),
  unit: z.string().optional(),
});

const setAttributesBody = z.record(z.string(), setAttributeValue);

// ============================================================================
// Router
// ============================================================================

export function createProductAttributesRouter(repo: ProductAttributesRepository) {
  const router = new Hono();

  // GET /products/:productId/versions/:versionId/attributes
  router.get('/', zValidator('query', getAttributesQuery), async (c) => {
    const productId = c.req.param('productId');
    const versionId = c.req.param('versionId');
    const query = c.req.valid('query');

    const attributes = await repo.getAttributes(productId, versionId, query.keys);

    return c.json({
      data: attributes,
      meta: {
        productId,
        versionId,
        count: Object.keys(attributes).length,
      },
    });
  });

  // PATCH /products/:productId/versions/:versionId/attributes
  router.patch('/', zValidator('json', setAttributesBody), async (c) => {
    const productId = c.req.param('productId');
    const versionId = c.req.param('versionId');
    const body = c.req.valid('json');

    // Validate body has at least one attribute
    if (Object.keys(body).length === 0) {
      return c.json({
        error: 'Validation Error',
        message: 'At least one attribute value is required',
      }, 400);
    }

    const updated = await repo.setAttributes(productId, versionId, body);

    return c.json({
      data: updated,
      meta: {
        productId,
        versionId,
        updated: Object.keys(body),
      },
    });
  });

  // GET /products/:productId/versions/:versionId/attributes/:key/history
  router.get('/:key/history', async (c) => {
    const productId = c.req.param('productId');
    const key = c.req.param('key');

    const history = await repo.getAttributeHistory(productId, key);

    return c.json({
      data: history,
      meta: {
        productId,
        key,
        count: history.length,
      },
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/products/attributes.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/products/attributes.ts
git add apps/api/src/routes/products/attributes.test.ts
git commit -m "feat(api): add product attributes routes

- GET /products/:id/versions/:vid/attributes
- PATCH /products/:id/versions/:vid/attributes
- GET /products/:id/versions/:vid/attributes/:key/history"
```

---

## Task 5.5: Create MikroORM Product Attributes Repository

**Files:**
- Create: `apps/api/src/routes/products/attributes-repository.ts`

**Step 1: Implement the repository**

```typescript
// apps/api/src/routes/products/attributes-repository.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import {
  ProductVersion,
  AttributeTemplate,
  AttributeSource,
  AttributeValueService,
  UnitConversionService,
  type AttributeValue,
} from '@eurocomply/database';
import type { ProductAttributesRepository } from './attributes.js';

/**
 * MikroORM implementation of ProductAttributesRepository.
 */
export class MikroOrmProductAttributesRepository implements ProductAttributesRepository {
  private attributeValueService: AttributeValueService;

  constructor(
    private readonly orm: MikroORM,
    private readonly tenantSchema: string,
  ) {
    // Create unit converter wrapper
    const unitConverter = {
      convert: async (value: number, fromUnit: string, toUnit: string) => {
        const em = this.orm.em.fork();
        const unitService = new UnitConversionService(em);
        return unitService.convert(value, fromUnit, toUnit);
      },
      getBaseUnit: async (system: string) => {
        const em = this.orm.em.fork();
        const unitService = new UnitConversionService(em);
        return unitService.getBaseUnitCode(system);
      },
    };

    // Create template repository wrapper
    const templateRepo = {
      findById: async (id: string) => {
        const em = this.orm.em.fork();
        const template = await em.findOne(AttributeTemplate, { id }, {
          populate: ['category'],
        });
        if (!template) return null;
        return {
          id: template.id,
          key: template.key,
          type: template.type,
          unitSystem: template.unitSystem,
          validationRules: template.validationRules,
          enumValues: template.enumValues,
        };
      },
    };

    this.attributeValueService = new AttributeValueService(unitConverter, templateRepo);
  }

  async getAttributes(
    productId: string,
    versionId: string,
    keys?: string[],
  ): Promise<Record<string, AttributeValue>> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const version = await em.findOne(ProductVersion, { id: versionId, product: { id: productId } });
    if (!version) {
      throw new Error(`Product version not found: ${productId}/${versionId}`);
    }

    const data = version.data as { attributes?: Record<string, AttributeValue> } | null;
    if (!data?.attributes) {
      return {};
    }

    let attributes = data.attributes;

    // Filter by keys if provided
    if (keys && keys.length > 0) {
      attributes = Object.fromEntries(
        Object.entries(attributes).filter(([key]) => keys.includes(key))
      );
    }

    return attributes;
  }

  async setAttributes(
    productId: string,
    versionId: string,
    values: Record<string, { val: unknown; unit?: string }>,
  ): Promise<Record<string, AttributeValue>> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const version = await em.findOneOrFail(ProductVersion, { id: versionId, product: { id: productId } });

    const data = (version.data as { attributes?: Record<string, AttributeValue> } | null) ?? {};
    const attributes = data.attributes ?? {};

    // Process each value update
    for (const [key, input] of Object.entries(values)) {
      // Find template by key
      const template = await em.findOne(AttributeTemplate, { key });
      if (!template) {
        throw new Error(`Unknown attribute key: ${key}`);
      }

      // Validate the value
      const errors = await this.attributeValueService.validateValue(
        template.id,
        input.val as number | string | boolean | unknown[],
        input.unit,
      );

      if (errors.length > 0) {
        throw new Error(`Validation failed for ${key}: ${errors.join(', ')}`);
      }

      // Normalize and store
      const normalized = await this.attributeValueService.normalizeValue(
        template.id,
        input.val as number | string | boolean | unknown[],
        input.unit,
        AttributeSource.MANUAL,
      );

      attributes[key] = normalized;
    }

    // Update version data
    version.data = { ...data, attributes };
    await em.flush();

    return attributes;
  }

  async getAttributeHistory(
    productId: string,
    key: string,
  ): Promise<AttributeValue[]> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    // Get all versions for the product
    const versions = await em.find(ProductVersion, { product: { id: productId } }, {
      orderBy: { createdAt: 'ASC' },
    });

    const history: AttributeValue[] = [];

    for (const version of versions) {
      const data = version.data as { attributes?: Record<string, AttributeValue> } | null;
      if (data?.attributes?.[key]) {
        history.push(data.attributes[key]);
      }
    }

    return history;
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/products/attributes-repository.ts
git commit -m "feat(api): add MikroORM ProductAttributesRepository

- Stores attributes on ProductVersion.data
- Validates and normalizes values
- History tracking across versions"
```

---

## Task 5.6: Add Unit Preference Middleware

**Files:**
- Create: `apps/api/src/middleware/unit-preferences.ts`
- Create: `apps/api/src/middleware/unit-preferences.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/middleware/unit-preferences.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { unitPreferencesMiddleware } from './unit-preferences.js';

describe('unitPreferencesMiddleware', () => {
  it('should parse X-Unit-Preferences header', async () => {
    const app = new Hono();

    app.use('*', unitPreferencesMiddleware());
    app.get('/test', (c) => {
      const prefs = c.get('unitPreferences');
      return c.json({ prefs });
    });

    const res = await app.request('/test', {
      headers: {
        'X-Unit-Preferences': 'MASS=OZA,LENGTH=INH',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { prefs: Record<string, string> };
    expect(body.prefs.MASS).toBe('OZA');
    expect(body.prefs.LENGTH).toBe('INH');
  });

  it('should return empty object when no header', async () => {
    const app = new Hono();

    app.use('*', unitPreferencesMiddleware());
    app.get('/test', (c) => {
      const prefs = c.get('unitPreferences');
      return c.json({ prefs });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    const body = await res.json() as { prefs: Record<string, string> };
    expect(body.prefs).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/middleware/unit-preferences.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the middleware**

```typescript
// apps/api/src/middleware/unit-preferences.ts
import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    unitPreferences: Record<string, string>;
  }
}

/**
 * Middleware to parse X-Unit-Preferences header.
 *
 * Format: "MASS=KGM,LENGTH=MTR,TEMPERATURE=CEL"
 *
 * Sets `c.get('unitPreferences')` with parsed preferences.
 */
export function unitPreferencesMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('X-Unit-Preferences');
    const preferences: Record<string, string> = {};

    if (header) {
      const pairs = header.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          preferences[key.trim()] = value.trim();
        }
      }
    }

    c.set('unitPreferences', preferences);

    await next();
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/middleware/unit-preferences.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/unit-preferences.ts
git add apps/api/src/middleware/unit-preferences.test.ts
git commit -m "feat(api): add unit preferences middleware

- Parses X-Unit-Preferences header
- Sets unitPreferences in context"
```

---

## Task 5.7: Wire Product Attributes Routes to App

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Update app.ts**

Add product attributes routes:

```typescript
// Add imports
import { createProductAttributesRouter, type ProductAttributesRepository } from './routes/products/attributes.js';
import { unitPreferencesMiddleware } from './middleware/unit-preferences.js';

// Update AppDependencies
export interface AppDependencies {
  // ... existing
  productAttributesRepository?: ProductAttributesRepository;
}

// Add middleware after auth
app.use('/api/*', unitPreferencesMiddleware());

// Add product attributes routes
if (deps?.productAttributesRepository) {
  const productsRouter = new Hono<Env>();
  productsRouter.route('/:productId/versions/:versionId/attributes',
    createProductAttributesRouter(deps.productAttributesRepository)
  );
  v1.route('/products', productsRouter);
}
```

**Step 2: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): wire product attributes routes

- Add unitPreferencesMiddleware
- Mount /products/:id/versions/:vid/attributes routes"
```

---

## Task 5.8: Create E2E Integration Test

**Files:**
- Create: `apps/api/src/routes/products/attributes.e2e.test.ts`

**Step 1: Create integration test**

```typescript
// apps/api/src/routes/products/attributes.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@eurocomply/database';
import {
  Product,
  ProductVersion,
  Category,
  CategoryType,
  TargetType,
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
  UnitSystem,
  UnitDefinition,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createProductAttributesRouter, type ProductAttributesRepository } from './attributes.js';
import { MikroOrmProductAttributesRepository } from './attributes-repository.js';

describe('Product Attributes API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  const testSchema = 'tenant_prod_attrs_e2e_test';
  let productId: string;
  let versionId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Create test schema
    await orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);

    // Seed units
    const em = orm.em.fork();
    const kgm = em.create(UnitDefinition, {
      code: 'KGM',
      name: 'Kilogram',
      symbol: 'kg',
      system: UnitSystem.MASS,
      factor: '1',
      isBase: true,
      isActive: true,
    });
    em.persist(kgm);

    const grm = em.create(UnitDefinition, {
      code: 'GRM',
      name: 'Gram',
      symbol: 'g',
      system: UnitSystem.MASS,
      factor: '0.001',
      isBase: false,
      isActive: true,
    });
    em.persist(grm);

    // Seed category
    const category = em.create(Category, {
      name: 'Test',
      path: 'test',
      type: CategoryType.LEAF,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });
    em.persist(category);
    await em.flush();

    // Seed attribute template
    const weightAttr = em.create(AttributeTemplate, {
      key: 'weight',
      name: 'Weight',
      type: AttributeType.NUMBER_UNIT,
      category,
      targetType: TargetType.PRODUCT,
      unitSystem: UnitSystem.MASS,
      rollupMethod: RollupMethod.SUM,
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 0,
    });
    em.persist(weightAttr);

    // Seed product and version
    const tenantEm = orm.em.fork();
    tenantEm.schema = testSchema;

    const product = tenantEm.create(Product, {
      name: 'Test Product',
      status: 'DRAFT',
    });
    tenantEm.persist(product);

    const version = tenantEm.create(ProductVersion, {
      product,
      version: 1,
      data: {},
    });
    tenantEm.persist(version);
    await tenantEm.flush();

    productId = product.id;
    versionId = version.id;

    // Create repository and app
    const repo = new MikroOrmProductAttributesRepository(orm, testSchema);
    app = new Hono();
    const router = new Hono();
    router.route('/:productId/versions/:versionId/attributes', createProductAttributesRouter(repo));
    app.route('/products', router);
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await orm.em.fork().nativeDelete(AttributeTemplate, {});
      await orm.em.fork().nativeDelete(Category, {});
      await orm.em.fork().nativeDelete(UnitDefinition, {});
      await teardownTestDb();
    }
  });

  it('should get empty attributes for new product', async () => {
    if (!orm) return;

    const res = await app.request(`/products/${productId}/versions/${versionId}/attributes`);
    expect(res.status).toBe(200);

    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data).toEqual({});
  });

  it('should set and get attributes', async () => {
    if (!orm) return;

    // Set attribute
    const setRes = await app.request(`/products/${productId}/versions/${versionId}/attributes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight: { val: 500, unit: 'GRM' },
      }),
    });
    expect(setRes.status).toBe(200);

    // Get and verify
    const getRes = await app.request(`/products/${productId}/versions/${versionId}/attributes`);
    expect(getRes.status).toBe(200);

    const body = await getRes.json() as { data: { weight: { val: number; unit: string } } };
    expect(body.data.weight).toBeDefined();
    expect(body.data.weight.val).toBeCloseTo(0.5, 5); // Normalized to KGM
    expect(body.data.weight.unit).toBe('KGM');
  });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/products/attributes.e2e.test.ts
git commit -m "test(api): add product attributes API e2e test

- Tests empty attributes for new product
- Tests set and get flow with normalization"
```

---

## Phase 5 Complete Checkpoint

At this point, Plan 5 is complete. Verify:

```bash
# Run all tests
pnpm test

# Run attribute-value tests
cd packages/database && pnpm test src/types/attribute-value
cd packages/database && pnpm test src/services/attribute-value
cd packages/database && pnpm test src/services/unit-preference
cd apps/api && pnpm test src/routes/products/attributes
cd apps/api && pnpm test src/middleware/unit-preferences

# Verify build
pnpm build
```

**Plan 5 Deliverables:**
- [x] AttributeValue types and Zod schema
- [x] AttributeValueService (normalize, validate, convertForDisplay)
- [x] UnitPreferenceService (Header > User > Org resolution)
- [x] Unit preferences middleware
- [x] GET /products/:id/versions/:vid/attributes
- [x] PATCH /products/:id/versions/:vid/attributes
- [x] GET /products/:id/versions/:vid/attributes/:key/history
- [x] MikroORM ProductAttributesRepository
- [x] E2E integration tests

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial implementation plan |
