# Data Model: Pesquisa e Seleção de Produtos Afiliados

## Modeling Principles

- O domínio é idêntico com persistência ligada ou desligada; somente a porta de armazenamento muda.
- Valores monetários são exatos, carregam moeda e nunca usam ponto flutuante binário.
- Todo instante persistido representa um momento absoluto em UTC; o timezone civil pertence ao job.
- O retrato da política e das ofertas é imutável dentro de uma execução.
- Uma execução contém muitas avaliações e no máximo um produto selecionado.
- URLs de afiliado são dados compartilháveis, mas não aparecem integralmente em logs.
- HTML bruto, cookies, tokens e credenciais nunca são entidades nem campos persistidos.

## Module Ownership

`affiliate-research` é o único bounded context e proprietário deste modelo. Entidades, value
objects e policies do domínio são TypeScript puro e não possuem decorators Nest ou TypeORM.
`ResearchExecutionStore` é a única porta de persistência exposta ao use case; records, mappers,
migrations e repositories PostgreSQL são detalhes internos do adapter do módulo.

Um futuro módulo não pode consultar `research_execution`, `evaluated_offer` ou `selected_product`
diretamente. Ele recebe o `SelectedProduct` pelo input/output contract público do módulo. Não há
Shared Kernel de domínio neste release; qualquer tipo compartilhado futuro exige semântica e
ownership explícitos.

## Domain Model

### QualificationPolicy

Value object imutável criado a partir da configuração validada.

| Field | Type | Rules |
|---|---|---|
| currency | ISO 4217 string | Inicialmente `BRL`; três letras maiúsculas |
| lowTicketMin | Money | Maior ou igual a zero |
| lowTicketMax | Money | Maior ou igual a `lowTicketMin` |
| mediumTicketMin | Money | Maior que `lowTicketMax` |
| mediumTicketMax | Money | Maior ou igual a `mediumTicketMin` |
| minimumDiscountPercent | Decimal percent | Maior que zero e menor ou igual a 100 |
| categoryIds | Non-empty string set | Categorias MLB únicas e configuradas |
| maxOffersPerRun | Integer | Entre 1 e 200 |
| affiliateEvidenceMaxAge | Duration | Positiva e limitada pela política operacional |
| fingerprint | SHA-256 string | Calculado da representação canônica dos campos anteriores |

### ResearchExecution

Aggregate root de uma ocorrência lógica do scheduler.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Gerado pela aplicação |
| executionKey | String | Único; `affiliate-research:<scheduled-for-UTC>` |
| runId | UUID | Correlação externa e de logs; único |
| mode | Enum | `SCHEDULED` ou `ONCE` |
| policy | QualificationPolicy snapshot | Obrigatória e imutável |
| scheduledFor | Instant | Instante lógico da ocorrência |
| startedAt | Instant | Obrigatório ao entrar em `RUNNING` |
| finishedAt | Instant/null | Obrigatório em estado terminal |
| status | ResearchExecutionStatus | Conforme máquina de estados |
| assessments | OfferAssessment[] | Uma por chave canônica de oferta |
| selectedProduct | SelectedProduct/null | No máximo um |
| counts | RunCounts | Todos os valores inteiros e não negativos |
| failure | SanitizedFailure/null | Código estável e mensagem sem segredos |

#### ResearchExecutionStatus

```text
CREATED -> RUNNING
RUNNING -> COMPLETED_WITH_SELECTION
RUNNING -> COMPLETED_NO_SELECTION
RUNNING -> FAILED
RUNNING -> INTERRUPTED
CREATED -> SKIPPED_OVERLAP
```

- Estados terminais não podem regressar.
- `COMPLETED_WITH_SELECTION` exige exatamente um `SelectedProduct`.
- Todos os outros estados exigem ausência de `SelectedProduct`.
- `FAILED` e `INTERRUPTED` exigem código de falha sanitizado.
- Uma ocorrência já terminal retorna o resultado existente quando repetida com o mesmo conteúdo.

### OfferAssessment

Retrato normalizado e decisão de uma oferta única na execução.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Gerado pela aplicação |
| executionId | UUID | Referência ao aggregate root |
| productId | String | Identificador oficial não vazio |
| variationKey | String | Identificador oficial ou sentinela `NO_VARIATION`; nunca nulo |
| canonicalKey | String | `<productId>:<variationKey>`; única por execução |
| categoryId | String | Categoria usada no ranking |
| sourcePosition | Integer | Positiva |
| capturedAt | Instant | Instante do retrato inicial |
| title | String | Trimado e não vazio |
| condition | Enum | Deve ser `NEW` para qualificação inicial |
| available | Boolean | Deve ser `true` para qualificação |
| sellerReputation | String/null | Evidência oficial quando disponível |
| currency | ISO 4217 string | Igual à política |
| originalPrice | Decimal money | Positivo |
| discountedPrice | Decimal money | Positivo e menor que `originalPrice` |
| discountAmount | Decimal money | `originalPrice - discountedPrice` |
| discountPercent | Decimal percent | Cálculo exato segundo regra de arredondamento |
| salesEvidence | SalesEvidence | Somente fonte oficial comparável |
| imageUrl | HTTPS URL | Imagem principal do mesmo produto/variação |
| affiliateEvidence | AffiliateEvidence/null | Obrigatória para qualificação final |
| outcome | AssessmentOutcome | `QUALIFIED` ou `REJECTED` |
| reasonCodes | String set | Vazio se qualificado; não vazio se rejeitado |
| qualificationRank | Integer/null | Preenchido somente para candidatos comparáveis |
| revalidatedAt | Instant/null | Obrigatório para o selecionado |

### SalesEvidence

| Field | Type | Rules |
|---|---|---|
| kind | Enum | `BEST_SELLER_RANK`, `SOLD_QUANTITY` ou `BEST_SELLER_LIST_POSITION` |
| value | Positive integer | Quanto menor o rank, melhor; quantidade usa ordem inversa |
| source | String | Operação oficial que forneceu a evidência |
| observedAt | Instant | Obrigatório |

Valores de tipos diferentes somente podem ser comparados quando uma regra explícita da origem
fornece equivalência. Sem equivalência, a oferta é rejeitada com `SALES_EVIDENCE_NOT_COMPARABLE`.

### AffiliateEvidence

Entrada produzida manualmente pela Central ou por integração formalmente autorizada.

| Field | Type | Rules |
|---|---|---|
| productId | String | Deve coincidir com a oferta |
| variationKey | String | Deve coincidir com a oferta ou `NO_VARIATION` |
| eligible | Boolean | Deve ser `true` |
| affiliateUrl | HTTPS URL | Destino resolve para o mesmo produto/variação |
| commissionPercent | Decimal percent | Maior que zero e menor ou igual a 100 |
| expectedCommissionAmount | Decimal money/null | Se informado, deve reconciliar com preço atual |
| extraEarningsAmount | Decimal money/null | Opcional, separado da comissão base |
| capturedAt | Instant | Não pode estar no futuro além da tolerância de relógio |
| validUntil | Instant | Deve ser posterior à coleta e à revalidação |
| source | Enum | `CENTRAL_MANUAL` ou `AUTHORIZED_INTEGRATION` |
| sourceReference | String | Referência auditável sem credenciais |
| fingerprint | SHA-256 string | Integridade da representação canônica |

O valor esperado final é recalculado a partir do preço atual e do percentual. Valor informado pela
origem pode ser mantido como evidência, mas divergência superior a um centavo rejeita a oferta.

### SelectedProduct

Pacote final imutável criado somente após revalidação.

| Field | Type | Rules |
|---|---|---|
| executionId | UUID | Um para um com `ResearchExecution` |
| assessmentId | UUID | Deve apontar para avaliação qualificada da mesma execução |
| productId/variationKey | String | Mesma chave da avaliação |
| title | String | Não vazio |
| ticketBand | Enum | `LOW` ou `MEDIUM` |
| prices | Money fields | Original, promocional e desconto consistentes |
| affiliateUrl | HTTPS URL | Validada para o mesmo item |
| commission | Commission fields | Percentual, valor esperado e indicadores de derivação |
| mainImageUrl | HTTPS URL | Mesma oferta/variação |
| salesEvidence | SalesEvidence | Evidência que determinou a ordenação |
| selectionRationale | String list | Critérios e desempates aplicados |
| capturedAt | Instant | Coleta inicial |
| validatedAt | Instant | Revalidação final e dentro da validade afiliada |

## Relational Model When Persistence Is Enabled

### `research_execution`

| Column | PostgreSQL type | Constraints/indexes |
|---|---|---|
| id | uuid | PK |
| execution_key | text | NOT NULL, UNIQUE |
| run_id | uuid | NOT NULL, UNIQUE |
| mode | text | NOT NULL, CHECK enum |
| status | text | NOT NULL, CHECK enum, indexed |
| policy_snapshot | jsonb | NOT NULL |
| policy_fingerprint | char(64) | NOT NULL |
| scheduled_for | timestamptz | NOT NULL, indexed |
| started_at | timestamptz | NOT NULL |
| finished_at | timestamptz | Nullable only while running |
| examined_count | integer | NOT NULL, CHECK >= 0 |
| qualified_count | integer | NOT NULL, CHECK >= 0 |
| rejected_count | integer | NOT NULL, CHECK >= 0 |
| selected_count | integer | NOT NULL, CHECK IN (0, 1) |
| failure_code | text | Nullable |
| failure_message | text | Nullable, sanitized |

### `evaluated_offer`

| Column group | PostgreSQL type | Constraints/indexes |
|---|---|---|
| id | uuid | PK |
| execution_id | uuid | NOT NULL, FK, indexed |
| product_id | text | NOT NULL |
| variation_key | text | NOT NULL |
| canonical_key | text | NOT NULL |
| category_id | text | NOT NULL |
| source_position | integer | NOT NULL, CHECK > 0 |
| captured_at/revalidated_at | timestamptz | Capture NOT NULL; revalidation nullable |
| title | text | NOT NULL, CHECK trimmed length > 0 |
| condition/availability/eligibility | typed scalar fields | NOT NULL where observed |
| currency | char(3) | NOT NULL |
| original_price | numeric(14,2) | NOT NULL, CHECK > 0 |
| discounted_price | numeric(14,2) | NOT NULL, CHECK > 0 |
| discount_amount | numeric(14,2) | NOT NULL, CHECK >= 0 |
| discount_percent | numeric(7,4) | NOT NULL, CHECK between 0 and 100 |
| sales_evidence | jsonb | NOT NULL |
| commission_amount | numeric(14,2) | Nullable for rejected offers |
| commission_percent | numeric(7,4) | Nullable for rejected offers |
| affiliate_url | text | Nullable for rejected offers; never logged raw |
| image_url | text | NOT NULL when qualified |
| outcome | text | NOT NULL, CHECK enum |
| reason_codes | jsonb | NOT NULL, JSON array |
| qualification_rank | integer | Nullable, CHECK > 0 when present |
| evidence_snapshot | jsonb | NOT NULL, sanitized |

Unique constraint: `(execution_id, canonical_key)`.

### `selected_product`

| Column | PostgreSQL type | Constraints/indexes |
|---|---|---|
| execution_id | uuid | PK and FK to `research_execution` |
| evaluated_offer_id | uuid | NOT NULL, FK to `evaluated_offer`, UNIQUE |
| final_snapshot | jsonb | NOT NULL, validates against output contract in application |
| selected_at | timestamptz | NOT NULL |
| selection_rationale | jsonb | NOT NULL, non-empty array |

The composite relationship must guarantee that the evaluated offer belongs to the same execution;
this can be enforced by a composite unique key and composite foreign key or inside the final
transaction before insert.

## Persistence Transactions

1. `begin(execution)` inserts or reads the row by `execution_key` in a short transaction.
2. Network discovery and qualification occur without a database transaction.
3. `complete(aggregate)` writes all assessments, optional selection and terminal counters in one
   transaction using only the transaction-scoped entity manager.
4. `fail(execution, sanitizedFailure)` records a terminal failure in a short transaction.
5. On startup, `markInterrupted(cutoff)` transitions stale `RUNNING` rows to `INTERRUPTED`.
6. Repeating `complete` with identical fingerprints returns the stored result; conflicting content
   for the same execution key raises an idempotency conflict and never overwrites the audit trail.

## Behavior When Persistence Is Disabled

- `ResearchExecutionStore` resolves to `NoopResearchExecutionStore`.
- No TypeORM provider, `DataSource`, pool, entity or migration code is initialized.
- Each operation returns `persistenceStatus: DISABLED` and retains no data after the call.
- The complete run summary and decisions remain available as sanitized structured events.
- Domain validation, selection and output contract remain identical to the PostgreSQL path.

## Retention and Sensitive Data

Retention duration is an operational policy to be defined before production and is not hard-coded
in this feature. Cleanup must delete child rows transactionally before or with the owning execution.
OAuth tokens, cookies, passwords, raw headers, browser state and unredacted external payloads are
never persisted. Affiliate URLs may be stored because they are intended for sharing, but loggers
must emit only product identity and a URL fingerprint.
