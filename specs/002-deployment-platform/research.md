# Research: Artefatos de Deployment do Backend

## Node.js image and build stages

- Decision: Use the official Node.js 24 Debian slim image family for both build and runtime, with a multi-stage Dockerfile. Install from `package-lock.json` using `npm ci`; compile in the build stage; install production dependencies separately with `npm ci --omit=dev`; copy only `dist`, production `node_modules`, and package metadata into the final stage.
- Rationale: The project requires Node.js >=24 and uses TypeScript, so build tools are needed only during compilation. The official Node image lists Node 24 Debian slim variants and supports common architectures. Docker recommends separating build output from runtime and using `USER` when the process does not need elevated privileges. This service has no native dependency that requires Alpine/musl-specific handling.
- Alternatives considered: Alpine was rejected for the initial image because its musl-based environment adds an avoidable compatibility variable; the default full Node image was rejected for runtime because it contains packages that this process does not need. One-stage build was rejected because TypeScript/compiler and development dependencies would remain in the deployable artifact.
- Sources: [Official Node.js Docker image documentation](https://github.com/nodejs/docker-node), [Docker build best practices](https://docs.docker.com/build/building/best-practices/), [Docker Node.js guide](https://docs.docker.com/guides/nodejs/).

## Runtime entrypoint and process lifecycle

- Decision: Runtime command is the direct exec form `node dist/main.js`, with `NODE_ENV=production`; do not use a shell wrapper or `npm start` as container PID 1. Do not declare an HTTP port or add an HTTP health check.
- Rationale: `package.json` defines `start` as `node dist/main.js`, the application has no HTTP listener, and Nest already installs SIGINT/SIGTERM shutdown hooks. Direct exec forwards container signals to Node without an intermediate shell. Health must be monitored by process exit/logs or platform-native checks, not a nonexistent web endpoint.
- Alternatives considered: `npm start` is a valid local command but adds npm as an intermediate process; a container health check was rejected because there is no health endpoint or separate readiness interface. An init wrapper is not needed for this single Node process unless runtime evidence later shows orphan child processes.
- Sources: [Docker Node.js guide](https://docs.docker.com/guides/nodejs/), [Dockerfile reference: exec form](https://docs.docker.com/reference/dockerfile/).

## PostgreSQL DDL and TypeORM migration state

- Decision: Keep the existing TypeORM migrations as the versioned evolution path and add a reviewable SQL bootstrap artifact for an empty PostgreSQL database. It must reproduce both current migrations, create TypeORM's `migrations` ledger table, and insert the exact timestamp/name records for `InitialSchema20261001000000` and `RetentionSchema20261001010000` in the same transaction.
- Rationale: Running raw table DDL alone would leave TypeORM reporting both migrations as pending; the existing `migration:run` would then attempt to create existing tables. TypeORM 0.3's migration executor uses a `migrations` table with `id`, `timestamp`, and `name`, and compares executed names with configured migration classes. Recording the exact current migration identities makes bootstrap compatible with the existing `migration:status` contract.
- Alternatives considered: Tell operators to use only `npm run migration:run` (does not satisfy the request for a DDL script); create the tables but omit migration history (unsafe on the next migration run); switch to ORM schema synchronization (rejected by project design and constitution because schema changes must be explicit/reviewable).
- Source: TypeORM migration ledger structure was checked in the installed TypeORM 0.3 `MigrationExecutor`; current migration classes and their DDL are in `src/modules/affiliate-research/infrastructure/persistence/postgres/`.

## DDL transaction and scope

- Decision: Make `database/schema.sql` a one-time bootstrap script for a fresh database, transactional and fail-fast, rather than silently mutating an unknown existing schema. Apply through a PostgreSQL client with stop-on-error enabled, then use the existing migration status command to verify.
- Rationale: `CREATE TABLE IF NOT EXISTS` can conceal a partially incompatible schema. Existing migrations already provide a safer versioned upgrade path for databases with data.
- Alternatives considered: Idempotent `IF NOT EXISTS` was rejected for ambiguous pre-existing state; dropping/recreating existing objects is destructive and outside this feature.

## Open provider decisions

- Decision: Keep the image provider-neutral and publish no deployment manifest, registry workflow, Compose production file, or host-specific health policy.
- Rationale: The user asked for DDL and the application image, and repository documentation says no hosting provider has been selected. Those two artifacts can be built without selecting one.
- Alternatives considered: Render, Kubernetes, and a generic VM deployment were not selected because each adds infrastructure assumptions outside the requested scope.
