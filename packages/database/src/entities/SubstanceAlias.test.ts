import { describe, it, expect } from 'vitest';
import { SubstanceAlias } from './SubstanceAlias.js';
import { Substance } from './Substance.js';
import { AliasType } from './enums/index.js';

describe('SubstanceAlias', () => {
  it('should create an alias with type and name', () => {
    const alias = new SubstanceAlias();
    alias.name = 'DMAC';
    alias.type = AliasType.COMMON;
    alias.language = 'en';

    expect(alias.name).toBe('DMAC');
    expect(alias.type).toBe(AliasType.COMMON);
    expect(alias.language).toBe('en');
  });

  it('should support IUPAC alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'N,N-Dimethylethanamide';
    alias.type = AliasType.IUPAC;

    expect(alias.type).toBe(AliasType.IUPAC);
  });

  it('should support TRADE alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Butyl cellosolve';
    alias.type = AliasType.TRADE;

    expect(alias.type).toBe(AliasType.TRADE);
  });

  it('should support SYNONYM alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Dimethylacetamide';
    alias.type = AliasType.SYNONYM;

    expect(alias.type).toBe(AliasType.SYNONYM);
  });

  it('should support INDEX_NAME alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'acetamide, N,N-dimethyl-';
    alias.type = AliasType.INDEX_NAME;

    expect(alias.type).toBe(AliasType.INDEX_NAME);
  });

  it('should default language to en', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Test';
    alias.type = AliasType.COMMON;

    expect(alias.language).toBe('en');
  });

  it('should link to substance via relationship', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';

    const alias = new SubstanceAlias();
    alias.name = 'DMAC';
    alias.type = AliasType.COMMON;
    alias.substance = substance;

    expect(alias.substance).toBe(substance);
    expect(alias.substance.casNumber).toBe('127-19-5');
  });
});
