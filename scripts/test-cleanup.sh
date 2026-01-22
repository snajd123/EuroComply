#!/bin/bash
# Cleanup test data
# Run: ./scripts/test-cleanup.sh [schema_name|--all]

set -e

DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5433}"
DB_NAME="${DATABASE_NAME:-eurocomply_test}"
DB_USER="${DATABASE_USER:-postgres}"
DB_PASS="${DATABASE_PASSWORD:-postgres}"

psql_cmd() {
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME "$@"
}

if [ "$1" == "--all" ]; then
  echo "Cleaning ALL tenant schemas and data..."
  echo ""

  # Drop all tenant schemas
  psql_cmd -c "
  DO \$\$
  DECLARE
    schema_name TEXT;
  BEGIN
    FOR schema_name IN
      SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
    LOOP
      EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(schema_name) || ' CASCADE';
      RAISE NOTICE 'Dropped schema: %', schema_name;
    END LOOP;
  END \$\$;
  "

  # Clear organizations table
  psql_cmd -c "TRUNCATE organizations, outbox_event CASCADE;"

  echo ""
  echo "✓ All tenant data cleaned"

elif [ -n "$1" ]; then
  echo "Dropping schema: $1"
  psql_cmd -c "DROP SCHEMA IF EXISTS \"$1\" CASCADE;"
  echo "✓ Schema dropped"

else
  echo "Usage:"
  echo "  ./scripts/test-cleanup.sh tenant_xxx    # Drop specific schema"
  echo "  ./scripts/test-cleanup.sh --all         # Drop ALL tenant schemas + clear orgs"
  echo ""
  echo "Current tenant schemas:"
  psql_cmd -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%';"
fi
