#!/bin/bash
# Verify database schema structure
# Run: ./scripts/test-schema.sh

set -e

echo "Database Schema Verification"
echo "============================"
echo ""

DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5433}"
DB_NAME="${DATABASE_NAME:-eurocomply_test}"
DB_USER="${DATABASE_USER:-postgres}"
DB_PASS="${DATABASE_PASSWORD:-postgres}"

psql_cmd() {
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME "$@"
}

echo "PUBLIC SCHEMA TABLES:"
echo "---------------------"
psql_cmd -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"

echo ""
echo "TENANT SCHEMAS:"
echo "---------------"
psql_cmd -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name;"

echo ""
echo "ORGANIZATIONS:"
echo "--------------"
psql_cmd -c "SELECT name, schema_name, provisioning_status, created_at FROM organizations ORDER BY created_at DESC LIMIT 10;"

echo ""
echo "SCHEMA TABLE COUNTS:"
echo "--------------------"
psql_cmd -c "
SELECT
  n.nspname as schema_name,
  COUNT(c.relname) as table_count
FROM pg_namespace n
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
GROUP BY n.nspname
ORDER BY n.nspname;
"
