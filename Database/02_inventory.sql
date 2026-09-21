-- Additive upgrade; existing products and movements are preserved.
ALTER TABLE display_products ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS brand varchar(80) NOT NULL DEFAULT '';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason varchar(300) NOT NULL DEFAULT '';
UPDATE stock_movements m SET brand=p.brand FROM display_products p WHERE m.product_id=p.id AND m.brand='';
INSERT INTO display_categories(name) SELECT DISTINCT category FROM display_products ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS ix_stock_movements_order ON stock_movements(timestamp_utc DESC,id DESC);
