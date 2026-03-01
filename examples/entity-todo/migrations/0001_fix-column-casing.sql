--
-- Fix column casing: camelCase → snake_case
-- The SQL builder (camelToSnake) generates snake_case column names,
-- but the original migration used camelCase, causing "no such column" errors.
--

ALTER TABLE todos RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE todos RENAME COLUMN "updatedAt" TO "updated_at";
