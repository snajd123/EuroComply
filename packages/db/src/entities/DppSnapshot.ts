import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index, Enum } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';
import { ReadinessProfile } from './ReadinessProfile.js';
import { User } from './User.js';

/**
 * DPP Snapshot workflow status.
 * Follows the issuance workflow: PENDING_REVIEW → VERIFIED → ATTESTED → SEALED → ISSUED → REVOKED
 */
export enum DppSnapshotStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  VERIFIED = 'VERIFIED',
  ATTESTED = 'ATTESTED',
  SEALED = 'SEALED',
  ISSUED = 'ISSUED',
  REVOKED = 'REVOKED',
}

/**
 * DPP Snapshot entity for Digital Product Passport issuance workflow.
 *
 * This entity manages the full lifecycle of a DPP from creation through issuance:
 * 1. PENDING_REVIEW - Initial snapshot created with deep-cloned product data
 * 2. VERIFIED - Contributor has verified the snapshot data
 * 3. ATTESTED - Editor has signed with user DID
 * 4. SEALED - System has applied corporate envelope (org DID signature)
 * 5. ISSUED - Verifiable Credential has been minted
 * 6. REVOKED - Credential has been revoked
 *
 * Architecture notes:
 * - Lives in tenant schema - no organizationId filtering needed
 * - Deep-clones product data at snapshot time for immutability
 * - Stores both user and organization signatures for forensic traceability
 */
@Entity({ tableName: 'dpp_snapshots' })
@Index({ properties: ['product', 'status'] })
export class DppSnapshot {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  @Index()
  product!: Product;

  // Version references (audit trail, not for verification)
  @ManyToOne(() => ProductVersion, { fieldName: 'design_version_id' })
  designVersion!: ProductVersion;

  @ManyToOne(() => ProductVersion, { fieldName: 'marketing_version_id', nullable: true })
  marketingVersion?: ProductVersion;

  // Deep-cloned data (immutable snapshot)
  @Property({ type: 'jsonb' })
  data!: Record<string, unknown>;

  @Property({ type: 'varchar', length: 64, fieldName: 'data_hash' })
  dataHash!: string;

  // Readiness
  @ManyToOne(() => ReadinessProfile, { fieldName: 'readiness_profile_id' })
  readinessProfile!: ReadinessProfile;

  @Property({ type: 'int', fieldName: 'completion_score' })
  completionScore!: number;

  // Workflow status
  @Enum({ items: () => DppSnapshotStatus, default: DppSnapshotStatus.PENDING_REVIEW })
  @Index()
  status: DppSnapshotStatus = DppSnapshotStatus.PENDING_REVIEW;

  // Verification (CONTRIBUTOR action)
  @Property({ type: 'timestamptz', fieldName: 'verified_at', nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => User, { fieldName: 'verified_by', nullable: true })
  verifiedBy?: User;

  // Attestation (EDITOR action) - User signature
  @Property({ type: 'timestamptz', fieldName: 'attested_at', nullable: true })
  attestedAt?: Date;

  @ManyToOne(() => User, { fieldName: 'attested_by', nullable: true })
  attestedBy?: User;

  @Property({ type: 'varchar', length: 255, fieldName: 'user_signature_did', nullable: true })
  userSignatureDid?: string;

  @Property({ type: 'text', fieldName: 'user_signature_jws', nullable: true })
  userSignatureJws?: string;

  @Property({ type: 'jsonb', fieldName: 'user_forensic_context', nullable: true })
  userForensicContext?: Record<string, unknown>;

  // Sealing (SYSTEM action) - Corporate envelope
  @Property({ type: 'timestamptz', fieldName: 'sealed_at', nullable: true })
  sealedAt?: Date;

  @Property({ type: 'varchar', length: 255, fieldName: 'org_signature_did', nullable: true })
  orgSignatureDid?: string;

  @Property({ type: 'text', fieldName: 'org_signature_jws', nullable: true })
  orgSignatureJws?: string;

  @Property({ type: 'jsonb', fieldName: 'org_forensic_context', nullable: true })
  orgForensicContext?: Record<string, unknown>;

  // Issuance
  @Property({ type: 'timestamptz', fieldName: 'issued_at', nullable: true })
  issuedAt?: Date;

  @Property({ type: 'varchar', length: 255, fieldName: 'vc_id', nullable: true })
  vcId?: string;

  @Property({ type: 'text', fieldName: 'vc_jwt', nullable: true })
  vcJwt?: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'dpp_url', nullable: true })
  dppUrl?: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'qr_code_url', nullable: true })
  qrCodeUrl?: string;

  // Revocation
  @Property({ type: 'int', fieldName: 'credential_status_index', nullable: true })
  credentialStatusIndex?: number;

  @Property({ type: 'jsonb', fieldName: 'timestamp_proof', nullable: true })
  timestampProof?: Record<string, unknown>;

  // Timestamps
  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
