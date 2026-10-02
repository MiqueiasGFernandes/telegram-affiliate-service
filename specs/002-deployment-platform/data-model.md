# Data Model: Artefatos de Deployment do Backend

Este documento descreve o schema físico que o script de bootstrap deve reproduzir. A fonte operacional de evolução permanece nas migrations TypeORM em `src/modules/affiliate-research/infrastructure/persistence/postgres/`.

## `research_execution`

Registro agregado de uma execução da rotina.

| Coluna | Tipo | Restrições |
|---|---|---|
| `execution_key` | `text` | Primary key |
| `run_id` | `uuid` | Not null, unique |
| `status` | `text` | Not null; limitado aos seis status definidos pela migration |
| `started_at` | `timestamptz` | Not null |
| `finished_at` | `timestamptz` | Nullable; constraint de lifecycle exige valor em status terminal |
| `duration_ms` | `integer` | Nullable |
| `policy_snapshot` | `jsonb` | Not null, default `{}` |
| `counts` | `jsonb` | Not null, default `{}` |
| `category_coverage` | `jsonb` | Not null, default `{}` |
| `failure_code` | `text` | Nullable, código sanitizado |

## `category_processing_result`

Uma linha por categoria processada; chave primária composta `(execution_key, category_id)`. A execução é referenciada por FK com `ON DELETE CASCADE`. `status` aceita `PROCESSED_WITH_RANKING`, `PROCESSED_NO_RANKING` ou `UNAVAILABLE`; `reference_count` é `smallint` entre 0 e 20; `failure_code` é opcional.

## `category_candidate_reference`

Cada referência de ranking por categoria. Possui `bigserial` PK, FK para a execução e FK composta `(execution_key, category_id)` para `category_processing_result`, ambas com cascade. `effective_position` é `smallint` entre 1 e 20; `reference_type` aceita `ITEM`, `PRODUCT` ou `USER_PRODUCT`; contém ID da origem, chave de avaliação opcional, motivo de rejeição e `observed_at timestamptz`. Unicidades: `(execution_key, category_id, effective_position)` e `(execution_key, category_id, reference_type, source_id)`.

## `evaluated_offer`

Snapshot de avaliação única por produto/variação dentro de uma execução. Possui `bigserial` PK, FK para `research_execution` com cascade e unicidade `(execution_key, canonical_key)`. `outcome` aceita `QUALIFIED` ou `REJECTED`; `reason_codes` e `offer_snapshot` são `jsonb` obrigatórios.

## `selected_product`

No máximo um produto escolhido por execução: `execution_key` é PK/FK com cascade. `canonical_key` referencia `(execution_key, canonical_key)` único em `evaluated_offer`; snapshot final é `jsonb` obrigatório.

## Retenção e migrations

- `research_execution_finished_at_lifecycle` exige `finished_at IS NULL` somente enquanto o status é `RUNNING` e `finished_at IS NOT NULL` em status terminal.
- `idx_research_execution_finished_at` indexa `research_execution(finished_at)` para expurgo por retenção.
- A execução do DDL completo deve criar a tabela de controle TypeORM `migrations` (`id`, `timestamp`, `name`) e registrar as duas migrations que o schema já incorpora. Sem esse ledger, `migration:status` indicaria mudanças pendentes.
- O DDL é um snapshot versãoado para banco vazio. Atualizações futuras devem alterar a migration e o DDL de bootstrap na mesma mudança.
