-- ============================================================
-- IT Asset Management System — Initial Schema Migration
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR     NOT NULL UNIQUE,
    permissions JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 VARCHAR     NOT NULL UNIQUE,
    password_hash         VARCHAR     NOT NULL,
    role_id               UUID        REFERENCES roles(id) ON DELETE SET NULL,
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    failed_login_attempts INT         NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. token_denylist
-- ============================================================
CREATE TABLE IF NOT EXISTS token_denylist (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti  VARCHAR     NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. departments
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR     NOT NULL UNIQUE,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. employees
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number VARCHAR     NOT NULL UNIQUE,
    full_name       VARCHAR     NOT NULL,
    email           VARCHAR     NOT NULL UNIQUE,
    department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,
    job_title       VARCHAR,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. asset_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_categories (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR     NOT NULL UNIQUE,
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    low_inventory_threshold INT       NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. vendors
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR     NOT NULL,
    contact_person VARCHAR,
    email          VARCHAR,
    phone          VARCHAR,
    address        TEXT,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. assets
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
    id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id             VARCHAR        NOT NULL UNIQUE,
    name                 VARCHAR        NOT NULL,
    category_id          UUID           REFERENCES asset_categories(id) ON DELETE SET NULL,
    asset_type           VARCHAR        NOT NULL
                             CHECK (asset_type IN (
                                 'Laptop', 'Desktop', 'Server', 'Printer',
                                 'Router', 'Switch', 'Mobile Device', 'Software License'
                             )),
    serial_number        VARCHAR        NOT NULL UNIQUE,
    manufacturer         VARCHAR,
    model                VARCHAR,
    purchase_date        DATE,
    purchase_cost        NUMERIC(12,2),
    warranty_expiry_date DATE,
    status               VARCHAR        NOT NULL DEFAULT 'Available'
                             CHECK (status IN (
                                 'Available', 'Assigned', 'Under Maintenance',
                                 'Lost', 'Retired', 'Disposed'
                             )),
    barcode              VARCHAR,
    qr_code              VARCHAR,
    is_archived          BOOLEAN        NOT NULL DEFAULT FALSE,
    notes                TEXT,
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. asset_status_history
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_status_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id        UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    previous_status VARCHAR,
    new_status      VARCHAR     NOT NULL,
    changed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. asset_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_assignments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    employee_id   UUID        REFERENCES employees(id) ON DELETE SET NULL,
    department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
    location      VARCHAR,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    returned_at   TIMESTAMPTZ,
    assigned_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    returned_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. maintenance_records
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_records (
    id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id                UUID           NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    issue_description       TEXT           NOT NULL,
    requested_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    scheduled_at            TIMESTAMPTZ,
    recurrence_interval_days INT,
    completed_at            TIMESTAMPTZ,
    vendor_id               UUID           REFERENCES vendors(id) ON DELETE SET NULL,
    vendor_name             VARCHAR,
    vendor_contact          VARCHAR,
    estimated_cost          NUMERIC(12,2),
    actual_cost             NUMERIC(12,2),
    resolution_notes        TEXT,
    status                  VARCHAR        NOT NULL DEFAULT 'Open'
                                CHECK (status IN ('Open', 'In Progress', 'Completed')),
    requested_by            UUID           REFERENCES users(id) ON DELETE SET NULL,
    assigned_to             UUID           REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. software_licenses
-- ============================================================
CREATE TABLE IF NOT EXISTS software_licenses (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    software_name VARCHAR     NOT NULL,
    vendor_id     UUID        REFERENCES vendors(id) ON DELETE SET NULL,
    license_key   VARCHAR,
    license_type  VARCHAR,
    total_seats   INT         NOT NULL DEFAULT 1,
    used_seats    INT         NOT NULL DEFAULT 0,
    purchase_date DATE,
    expiry_date   DATE,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_seats_non_negative CHECK (total_seats >= 0 AND used_seats >= 0),
    CONSTRAINT chk_used_seats_lte_total CHECK (used_seats <= total_seats)
);

-- ============================================================
-- 13. license_installations
-- ============================================================
CREATE TABLE IF NOT EXISTS license_installations (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id     UUID        NOT NULL REFERENCES software_licenses(id) ON DELETE CASCADE,
    asset_id       UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    installed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uninstalled_at TIMESTAMPTZ,
    installed_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14. purchase_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id         UUID           REFERENCES vendors(id) ON DELETE SET NULL,
    item_type         VARCHAR
                          CHECK (item_type IN ('Asset', 'License')),
    item_description  TEXT,
    quantity          INT            NOT NULL DEFAULT 1,
    unit_cost         NUMERIC(12,2),
    total_cost        NUMERIC(12,2),
    order_date        DATE,
    invoice_reference VARCHAR,
    status            VARCHAR        NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending', 'Received', 'Cancelled')),
    received_at       TIMESTAMPTZ,
    created_by        UUID           REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR     NOT NULL,
    title       VARCHAR     NOT NULL,
    message     TEXT,
    entity_type VARCHAR,
    entity_id   UUID,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dedup_key   VARCHAR     UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 16. audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type    VARCHAR     NOT NULL,
    entity_id      UUID,
    action         VARCHAR     NOT NULL,
    acting_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
    timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address     VARCHAR,
    changed_fields JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 17. system_config
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key        VARCHAR     NOT NULL UNIQUE,
    value      JSONB       NOT NULL,
    updated_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- assets
CREATE INDEX IF NOT EXISTS idx_assets_status       ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category_id  ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_serial_number ON assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_assets_asset_id     ON assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_is_archived  ON assets(is_archived);

-- asset_assignments
CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset_id    ON asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee_id ON asset_assignments(employee_id);
-- Partial index for active (not yet returned) assignments
CREATE INDEX IF NOT EXISTS idx_asset_assignments_active
    ON asset_assignments(asset_id, employee_id)
    WHERE returned_at IS NULL;

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type    ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id      ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acting_user_id ON audit_logs(acting_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp      ON audit_logs(timestamp);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup_key ON notifications(dedup_key);

-- maintenance_records
CREATE INDEX IF NOT EXISTS idx_maintenance_records_asset_id     ON maintenance_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status       ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_scheduled_at ON maintenance_records(scheduled_at);

-- token_denylist
CREATE INDEX IF NOT EXISTS idx_token_denylist_token_jti  ON token_denylist(token_jti);
CREATE INDEX IF NOT EXISTS idx_token_denylist_expires_at ON token_denylist(expires_at);
