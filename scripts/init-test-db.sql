-- Creates the test database used by integration tests.
-- This script runs automatically when the Postgres container is first initialized.
-- It does NOT run on subsequent starts (Postgres only runs initdb scripts on fresh volumes).
--
-- To recreate: docker compose down -v && docker compose up -d

CREATE DATABASE vertz_test;
