CREATE TABLE IF NOT EXISTS display_products (
    id TEXT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    brand VARCHAR(80) NOT NULL DEFAULT 'Sin marca',
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    category VARCHAR(80) NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_display_products_category ON display_products (category);
CREATE INDEX IF NOT EXISTS ix_display_products_stock ON display_products (quantity);

CREATE TABLE IF NOT EXISTS display_categories (
    name VARCHAR(80) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES display_products(id) ON DELETE CASCADE,
    product_name VARCHAR(120) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('Added', 'Updated', 'Used', 'Restocked')),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    resulting_stock INTEGER NOT NULL CHECK (resulting_stock >= 0),
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_stock_movements_timestamp ON stock_movements (timestamp_utc);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product ON stock_movements (product_id);

INSERT INTO display_categories (name) VALUES ('Monitores'), ('Accesorios')
ON CONFLICT (name) DO NOTHING;
