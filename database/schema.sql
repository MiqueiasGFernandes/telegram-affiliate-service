-- Affiliate Research PostgreSQL schema bootstrap, version 20261001010000.
-- Mirrors InitialSchema20261001000000 and RetentionSchema20261001010000.
-- Apply only to an empty database. Existing databases must use TypeORM migrations.
BEGIN;

CREATE TABLE migrations (
  id serial PRIMARY KEY,
  "timestamp" bigint NOT NULL,
  name character varying NOT NULL
);

CREATE TABLE research_execution (
  execution_key text PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK (
    status IN (
      'RUNNING',
      'COMPLETED_WITH_SELECTION',
      'COMPLETED_NO_SELECTION',
      'INCOMPLETE',
      'FAILED',
      'INTERRUPTED'
    )
  ),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text
);

CREATE TABLE category_processing_result (
  execution_key text NOT NULL REFERENCES research_execution(execution_key) ON DELETE CASCADE,
  category_id text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('PROCESSED_WITH_RANKING', 'PROCESSED_NO_RANKING', 'UNAVAILABLE')
  ),
  reference_count smallint NOT NULL CHECK (reference_count BETWEEN 0 AND 20),
  failure_code text,
  PRIMARY KEY (execution_key, category_id)
);

CREATE TABLE category_candidate_reference (
  id bigserial PRIMARY KEY,
  execution_key text NOT NULL REFERENCES research_execution(execution_key) ON DELETE CASCADE,
  category_id text NOT NULL,
  effective_position smallint NOT NULL CHECK (effective_position BETWEEN 1 AND 20),
  reported_position smallint,
  reference_type text NOT NULL CHECK (reference_type IN ('ITEM', 'PRODUCT', 'USER_PRODUCT')),
  source_id text NOT NULL,
  assessment_key text,
  rejection_code text,
  observed_at timestamptz NOT NULL,
  UNIQUE (execution_key, category_id, effective_position),
  UNIQUE (execution_key, category_id, reference_type, source_id),
  FOREIGN KEY (execution_key, category_id)
    REFERENCES category_processing_result(execution_key, category_id) ON DELETE CASCADE
);

CREATE TABLE evaluated_offer (
  id bigserial PRIMARY KEY,
  execution_key text NOT NULL REFERENCES research_execution(execution_key) ON DELETE CASCADE,
  product_id text NOT NULL,
  variation_key text NOT NULL,
  canonical_key text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('QUALIFIED', 'REJECTED')),
  reason_codes jsonb NOT NULL,
  offer_snapshot jsonb NOT NULL,
  UNIQUE (execution_key, canonical_key)
);

CREATE TABLE selected_product (
  execution_key text PRIMARY KEY REFERENCES research_execution(execution_key) ON DELETE CASCADE,
  canonical_key text NOT NULL,
  product_snapshot jsonb NOT NULL,
  FOREIGN KEY (execution_key, canonical_key)
    REFERENCES evaluated_offer(execution_key, canonical_key)
);

ALTER TABLE research_execution
  ADD CONSTRAINT research_execution_finished_at_lifecycle
  CHECK (
    (status = 'RUNNING' AND finished_at IS NULL)
    OR (status <> 'RUNNING' AND finished_at IS NOT NULL)
  );

CREATE INDEX idx_research_execution_finished_at ON research_execution (finished_at);

-- Register the migrations represented above so TypeORM will not rerun CREATE TABLE on this schema.
INSERT INTO migrations ("timestamp", name) VALUES
  (20261001000000, 'InitialSchema20261001000000'),
  (20261001010000, 'RetentionSchema20261001010000');

COMMIT;
