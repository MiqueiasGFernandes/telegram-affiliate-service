# Contract: Bootstrap PostgreSQL

## Artifact

Planned path: `database/schema.sql`.

## Supported operation

- Input: empty PostgreSQL database at the version declared by the implementation and an operator role with permission to create tables/indexes and sequences.
- Execution: `psql` with `ON_ERROR_STOP=1`; all schema objects and migration ledger records succeed or roll back together.
- Output: the five application tables, declared constraints/FKs, retention index, and TypeORM migration records matching current migrations.
- Verification: `npm run migration:status` reports no pending migrations after applying the script.

## Safety and compatibility

- Bootstrap is for a fresh database. It must fail on conflicting pre-existing objects instead of silently treating an unknown schema as current.
- Do not include database creation, credentials, seed business data, destructive drops, or runtime automatic schema synchronization.
- Existing databases must use the versioned TypeORM migration flow; never apply bootstrap over production data.
- The DDL and TypeORM migrations form one schema version and change together. A contract/integration check should verify the resulting tables and migration identities against a temporary PostgreSQL instance.
- The application continues to require `PERSISTENCE_ENABLED=true` and `DATABASE_URL` before connecting; provisioning remains outside the application container.
