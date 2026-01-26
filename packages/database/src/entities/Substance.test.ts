import { describe, it, expect } from 'vitest';
import { Substance } from './Substance.js';

describe('Substance', () => {
  it('should create a substance with CAS number', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';
    substance.ecNumber = '204-826-4';
    substance.isSvhc = true;
    substance.requiresAuthorization = true;
    substance.isRestricted = false;

    expect(substance.casNumber).toBe('127-19-5');
    expect(substance.primaryName).toBe('N,N-Dimethylacetamide');
    expect(substance.isSvhc).toBe(true);
  });

  it('should have regulatory status defaults', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-5';
    substance.primaryName = 'Water';

    expect(substance.isSvhc).toBe(false);
    expect(substance.requiresAuthorization).toBe(false);
    expect(substance.isRestricted).toBe(false);
    expect(substance.isActive).toBe(true);
  });

  it('should store molecular data', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';
    substance.molecularFormula = 'C4H9NO';
    substance.molecularWeight = '87.1204';

    expect(substance.molecularFormula).toBe('C4H9NO');
    expect(substance.molecularWeight).toBe('87.1204');
  });

  it('should store authorization dates', () => {
    const sunsetDate = new Date('2025-02-28');
    const latestApplicationDate = new Date('2024-08-28');

    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'DMAC';
    substance.sunsetDate = sunsetDate;
    substance.latestApplicationDate = latestApplicationDate;

    expect(substance.sunsetDate).toEqual(sunsetDate);
    expect(substance.latestApplicationDate).toEqual(latestApplicationDate);
  });

  it('should validate CAS number on assignment', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-6'; // Invalid check digit
    substance.primaryName = 'Invalid';

    expect(() => substance.validateCasNumber()).toThrow('Invalid CAS number: 7732-18-6');
  });

  it('should pass validation for valid CAS number', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-5'; // Valid - Water
    substance.primaryName = 'Water';

    expect(() => substance.validateCasNumber()).not.toThrow();
  });
});
