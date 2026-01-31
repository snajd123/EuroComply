import { describe, it, expect } from 'vitest';
import { UnresolvedStatus } from './UnresolvedStatus.js';
import { ResolutionType } from './ResolutionType.js';
import { DisclosureStatus } from './DisclosureStatus.js';
import { AttestationType } from './AttestationType.js';

describe('UnresolvedStatus', () => {
  it('should have all status values', () => {
    expect(UnresolvedStatus.PENDING).toBe('PENDING');
    expect(UnresolvedStatus.DISCLOSURE_REQUESTED).toBe('DISCLOSURE_REQUESTED');
    expect(UnresolvedStatus.RESOLVED).toBe('RESOLVED');
    expect(UnresolvedStatus.IGNORED).toBe('IGNORED');
    expect(UnresolvedStatus.NOT_APPLICABLE).toBe('NOT_APPLICABLE');
  });
});

describe('ResolutionType', () => {
  it('should have all resolution types', () => {
    expect(ResolutionType.MANUAL_MATCH).toBe('MANUAL_MATCH');
    expect(ResolutionType.SUPPLIER_DISCLOSURE).toBe('SUPPLIER_DISCLOSURE');
    expect(ResolutionType.NEW_SUBSTANCE).toBe('NEW_SUBSTANCE');
    expect(ResolutionType.PROPRIETARY_ACCEPTED).toBe('PROPRIETARY_ACCEPTED');
  });
});

describe('DisclosureStatus', () => {
  it('should have all disclosure statuses', () => {
    expect(DisclosureStatus.PENDING).toBe('PENDING');
    expect(DisclosureStatus.LINK_ACCESSED).toBe('LINK_ACCESSED');
    expect(DisclosureStatus.DISCLOSED).toBe('DISCLOSED');
    expect(DisclosureStatus.ATTESTED).toBe('ATTESTED');
    expect(DisclosureStatus.EXPIRED).toBe('EXPIRED');
    expect(DisclosureStatus.DECLINED).toBe('DECLINED');
  });
});

describe('AttestationType', () => {
  it('should have all attestation types', () => {
    expect(AttestationType.FULL_DISCLOSURE).toBe('FULL_DISCLOSURE');
    expect(AttestationType.COMPLIANT_ATTESTATION).toBe('COMPLIANT_ATTESTATION');
    expect(AttestationType.NON_REGULATED).toBe('NON_REGULATED');
  });
});
