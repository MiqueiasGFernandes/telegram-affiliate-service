# Contract: Backend OCI Image

## Build interface

- Context: repository root.
- Recipe: root `Dockerfile` and `.dockerignore`.
- Build command: `docker build -t telegram-affiliate-service:<revision> .`.
- Runtime: Node.js 24+, Linux; official Debian slim Node image family; target platform can be selected by the image builder.

## Runtime interface

- Entrypoint: `node dist/main.js` in exec form.
- Default environment: `NODE_ENV=production`; scheduler configuration, Mercado Livre credentials, evidence-file path, database URL, and all other runtime values are injected by the deployment environment.
- Filesystem: compiled application and production dependencies are read-only in concept; evidence JSON is mounted/provided at its absolute configured path with read access for the non-root process.
- Network: outbound access required for official Mercado Livre APIs and PostgreSQL when enabled; no inbound HTTP port is exposed.
- Replicas: exactly one active replica per environment.
- Shutdown: SIGTERM/SIGINT must reach Node directly; Nest shutdown hooks close the application context.
- Migrations: no automatic migration or DDL at container startup. Prepare schema before rollout, either via reviewed bootstrap SQL for an empty database or the existing TypeORM migration procedure for an existing installation.

## Image contents and exclusions

The final stage contains `dist/`, production `node_modules`, and package metadata required at runtime. It excludes TypeScript compiler, development dependencies, tests, Git metadata, local environment files, evidence fixtures/credentials, and host `node_modules`. The process runs as the unprivileged `node` user.

## Operational failures

Invalid/missing required configuration or failed application initialization exits nonzero. No HTTP health endpoint exists; the platform must use process state and sanitized structured logs for supervision.
