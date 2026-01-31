import { Entity, Property, Index, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';
import { UnresolvedSubstance } from './UnresolvedSubstance.js';
import { DisclosureStatus } from '../enums/DisclosureStatus.js';
import { AttestationType } from '../enums/AttestationType.js';
import type { Rel } from '@mikro-orm/core';

/**
 * Tracks blind disclosure requests to suppliers for proprietary substances.
 * Suppliers can disclose CAS (encrypted) or provide attestation.
 */
@Entity({ tableName: 'blind_disclosure_request', schema: 'public' })
export class BlindDisclosureRequest extends BaseEntity {
  @ManyToOne(() => UnresolvedSubstance, { fieldName: 'unresolved_substance_id' })
  @Index()
  unresolvedSubstance!: Rel<UnresolvedSubstance>;

  /** Supplier to contact */
  @Property({ length: 100, name: 'supplier_id' })
  @Index()
  supplierId!: string;

  /** Product that uses this substance (optional) */
  @Property({ length: 100, name: 'product_id', nullable: true })
  productId?: string;

  /** When request was created */
  @Property({ type: 'timestamptz', name: 'requested_at', defaultRaw: 'NOW()' })
  requestedAt: Date = new Date();

  /** Who initiated the request */
  @Property({ length: 255, name: 'requested_by' })
  requestedBy!: string;

  /** Current status */
  @Enum({ items: () => DisclosureStatus })
  @Index()
  status!: DisclosureStatus;

  /** One-time access token for supplier portal */
  @Property({ length: 255, name: 'secure_token' })
  @Index()
  secureToken!: string;

  /** When token expires */
  @Property({ type: 'timestamptz', name: 'token_expires_at' })
  tokenExpiresAt!: Date;

  /** Encrypted CAS if disclosed */
  @Property({ type: 'text', name: 'disclosed_cas_number', nullable: true })
  disclosedCasNumber?: string;

  /** When disclosure was made */
  @Property({ type: 'timestamptz', name: 'disclosed_at', nullable: true })
  disclosedAt?: Date;

  /** Type of attestation provided */
  @Enum({ items: () => AttestationType, name: 'attestation_type', nullable: true })
  attestationType?: AttestationType;

  /** S3 key for signed attestation document */
  @Property({ type: 'text', name: 'attestation_document', nullable: true })
  attestationDocument?: string;
}
