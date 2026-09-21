ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
CHECK (type IN ('Added','Updated','Used','Restocked','Voided'));
