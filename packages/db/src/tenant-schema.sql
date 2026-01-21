-- Tenant Schema DDL
-- This file contains the complete DDL for creating a tenant schema.
-- Schema name is substituted at runtime via ${schemaName}.

CREATE SCHEMA IF NOT EXISTS "${schemaName}";
SET search_path = "${schemaName}";

-- Users (synced from Clerk)
CREATE TABLE users (
    id VARCHAR(30) PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Organization membership and workspace authorities
CREATE TABLE organization_users (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    design_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    operations_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    marketing_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    compliance_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User DID history for key rotation tracking
CREATE TABLE user_did_history (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_user_did_history_user ON user_did_history(user_id);

-- Organization DID history
CREATE TABLE org_did_history (
    id VARCHAR(30) PRIMARY KEY,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- Products (the hub entity)
CREATE TABLE products (
    id VARCHAR(30) PRIMARY KEY,
    product_type VARCHAR(20) NOT NULL DEFAULT 'FINISHED_GOOD',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(30) REFERENCES products(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_parent ON products(parent_id);
CREATE INDEX idx_products_status ON products(status);

-- Product identifiers (GTIN, SKU, Internal)
CREATE TABLE product_identifiers (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, type)
);

CREATE INDEX idx_product_identifiers_value ON product_identifiers(value);

-- Product versions (per-workspace versioning)
CREATE TABLE product_versions (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    workspace VARCHAR(20) NOT NULL,
    version_number INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_by VARCHAR(30) NOT NULL REFERENCES users(id),
    published_by VARCHAR(30) REFERENCES users(id),
    published_at TIMESTAMPTZ,
    signature_did VARCHAR(255),
    signature_jws TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, workspace, version_number)
);

CREATE INDEX idx_product_versions_product ON product_versions(product_id);
CREATE INDEX idx_product_versions_status ON product_versions(status);

-- Bill of materials
CREATE TABLE bom_entries (
    id VARCHAR(30) PRIMARY KEY,
    parent_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    child_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    quantity DECIMAL NOT NULL,
    unit VARCHAR(20) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(parent_product_id, child_product_id, version_id),
    CHECK(parent_product_id != child_product_id)
);

CREATE INDEX idx_bom_entries_parent ON bom_entries(parent_product_id);
CREATE INDEX idx_bom_entries_version ON bom_entries(version_id);

-- DPP snapshots
CREATE TABLE dpp_snapshots (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    design_version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    marketing_version_id VARCHAR(30) REFERENCES product_versions(id),
    credential_hash VARCHAR(64) NOT NULL UNIQUE,
    issuer_did VARCHAR(255) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    r2_path VARCHAR(500) NOT NULL,
    qr_code_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dpp_snapshots_product ON dpp_snapshots(product_id);
CREATE INDEX idx_dpp_snapshots_status ON dpp_snapshots(status);

-- Operations events (forensic ledger with hash chain)
CREATE TABLE operations_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL,
    actor_did VARCHAR(255) NOT NULL,
    signature_jws TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operations_events_type ON operations_events(event_type);
CREATE INDEX idx_operations_events_hash ON operations_events(hash);
CREATE INDEX idx_operations_events_created ON operations_events(created_at);

-- Outbox events (transactional outbox pattern)
CREATE TABLE outbox_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(30) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- Status lists (revocation registry)
CREATE TABLE status_lists (
    id VARCHAR(30) PRIMARY KEY,
    purpose VARCHAR(20) NOT NULL,
    encoded_list TEXT NOT NULL,
    current_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status list entries
CREATE TABLE status_list_entries (
    id VARCHAR(30) PRIMARY KEY,
    status_list_id VARCHAR(30) NOT NULL REFERENCES status_lists(id),
    credential_id VARCHAR(30) NOT NULL,
    index INT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_list_entries_list ON status_list_entries(status_list_id);
CREATE INDEX idx_status_list_entries_credential ON status_list_entries(credential_id);

-- Readiness profiles (compliance templates)
CREATE TABLE readiness_profiles (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    regulation VARCHAR(50) NOT NULL,
    product_category VARCHAR(100),
    requirements JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(30),
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
