-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED');

-- CreateEnum
CREATE TYPE "DPPSnapshotStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'ATTESTED', 'SEALED', 'ISSUED', 'REVOKED');

-- CreateTable
CREATE TABLE "user_did_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "walt_id_key_id" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "status_list_index" INTEGER NOT NULL,

    CONSTRAINT "user_did_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_did_history" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "walt_id_key_id" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "status_list_index" INTEGER NOT NULL,

    CONSTRAINT "org_did_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "event_hash" TEXT NOT NULL,
    "previous_event_hash" TEXT,
    "sequence_number" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "user_signature_did" TEXT,
    "user_signature_jws" TEXT,
    "org_signature_did" TEXT,
    "org_signature_jws" TEXT,
    "forensic_context" JSONB,
    "credential_status_index" INTEGER,
    "timestamp_proof" JSONB,

    CONSTRAINT "operations_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "required_fields" JSONB NOT NULL,
    "required_attestations" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "readiness_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpp_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "design_version_id" TEXT NOT NULL,
    "marketing_version_id" TEXT,
    "data" JSONB NOT NULL,
    "data_hash" TEXT NOT NULL,
    "readiness_profile_id" TEXT NOT NULL,
    "completion_score" INTEGER NOT NULL,
    "status" "DPPSnapshotStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "attested_at" TIMESTAMP(3),
    "attested_by" TEXT,
    "user_signature_did" TEXT,
    "user_signature_jws" TEXT,
    "user_forensic_context" JSONB,
    "sealed_at" TIMESTAMP(3),
    "org_signature_did" TEXT,
    "org_signature_jws" TEXT,
    "org_forensic_context" JSONB,
    "issued_at" TIMESTAMP(3),
    "vc_id" TEXT,
    "vc_jwt" TEXT,
    "dpp_url" TEXT,
    "qr_code_url" TEXT,
    "credential_status_index" INTEGER,
    "timestamp_proof" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dpp_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_did_history_user_id_idx" ON "user_did_history"("user_id");

-- CreateIndex
CREATE INDEX "user_did_history_did_idx" ON "user_did_history"("did");

-- CreateIndex
CREATE INDEX "org_did_history_organization_id_idx" ON "org_did_history"("organization_id");

-- CreateIndex
CREATE INDEX "org_did_history_did_idx" ON "org_did_history"("did");

-- CreateIndex
CREATE INDEX "operations_events_organization_id_event_type_idx" ON "operations_events"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "operations_events_organization_id_sequence_number_idx" ON "operations_events"("organization_id", "sequence_number");

-- CreateIndex
CREATE INDEX "operations_events_status_idx" ON "operations_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_profiles_category_key" ON "readiness_profiles"("category");

-- CreateIndex
CREATE INDEX "dpp_snapshots_organization_id_status_idx" ON "dpp_snapshots"("organization_id", "status");

-- CreateIndex
CREATE INDEX "dpp_snapshots_product_id_idx" ON "dpp_snapshots"("product_id");

-- AddForeignKey
ALTER TABLE "user_did_history" ADD CONSTRAINT "user_did_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_did_history" ADD CONSTRAINT "org_did_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpp_snapshots" ADD CONSTRAINT "dpp_snapshots_readiness_profile_id_fkey" FOREIGN KEY ("readiness_profile_id") REFERENCES "readiness_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
