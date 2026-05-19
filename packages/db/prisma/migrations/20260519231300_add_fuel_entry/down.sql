-- Reverse of 20260519231300_add_fuel_entry/migration.sql
-- Drops fuel_entries table (FKs cascade with the table drop).

DROP TABLE IF EXISTS "fuel_entries";
