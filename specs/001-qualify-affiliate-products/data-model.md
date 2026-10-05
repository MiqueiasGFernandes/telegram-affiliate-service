# Data Model: Pesquisa e Seleção de Produtos Afiliados

## Modeling Principles

- O domínio é idêntico com persistência ligada ou desligada; somente a porta de armazenamento muda.
- Valores monetários são decimais exatos, carregam moeda e nunca usam ponto flutuante binário.
- Todo instante persistido representa um instante UTC; o fuso civil pertence à configuração do job.
- Política, categorias descobertas e retratos de oferta são imutáveis dentro de uma execução.
- Uma execução contém até 10 categorias folha selecionadas dinamicamente, referências de ranking, avaliações únicas e no
  máximo um produto selecionado.
- Uma mesma oferta pode pertencer a várias categorias: a avaliação comercial é única, as posições
  de ranking permanecem separadas por categoria.
- URLs afiliadas nunca aparecem completas em logs; credenciais e payloads brutos não são persistidos.

## Module Ownership

`affiliate-research` é o único bounded context e proprietário deste modelo. Entidades, value objects
e policies do domínio são TypeScript puro, sem decorators Nest ou TypeORM. `ResearchExecutionStore`
é a única porta de persistência usada pelo caso de uso e pela manutenção técnica; records, mappers,
migrations e repositories são detalhes internos do adapter PostgreSQL.

## Domain Model

### QualificationPolicy

Value object imutável criado a partir da configuração validada.

| Field | Type | Rules |
|---|---|---|
| currency | ISO 4217 string | Inicialmente `BRL`; três letras maiúsculas |
| lowTicketMin / lowTicketMax | Money | Limites inclusivos; min ≤ max |
| mediumTicketMin / mediumTicketMax | Money | min > lowTicketMax; min ≤ max |
| minimumDiscountPercent | Decimal percent | Maior que zero e menor ou igual a 100 |
| categoryIds | Ordered unique string list | Até 10 folhas MLB descobertas por volume de anúncios e validadas oficialmente |
| fingerprint | SHA-256 string | Hash da política e das categorias selecionadas para esta execução |

Não há `maxOffersPerRun`: o máximo bruto de 200 é derivado de dez categorias com até vinte
referências cada. Nenhuma referência oficial é descartada por corte configurável.

### ResearchExecution

Aggregate root de uma ocorrência lógica do scheduler.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Gerado pela aplicação |
| executionKey | String | Único; `affiliate-research:<scheduled-for-UTC>` |
| runId | UUID | Correlação externa e de logs; único |
| mode | Enum | `SCHEDULED` ou `ONCE` |
| policy | QualificationPolicy snapshot | Obrigatória e imutável |
| scheduledFor / startedAt | Instant | Obrigatórios |
| finishedAt | Instant/null | Obrigatório em estado terminal |
| status | ResearchExecutionStatus | `CREATED`, `RUNNING`, `COMPLETED_WITH_SELECTION`, `COMPLETED_NO_SELECTION`, `INCOMPLETE`, `FAILED`, `INTERRUPTED`, `SKIPPED_OVERLAP` |
| categoryResults | CategoryProcessingResult[] | Um resultado por categoria selecionada dinamicamente |
| rankingEntries | CategoryCandidateReference[] | Proveniência de cada referência por categoria |
| assessments | OfferAssessment[] | Uma por produto/variação única |
| selectedProduct | SelectedProduct/null | No máximo um |
| counts | RunCounts | Contagens não negativas de referências, avaliações e seleção |
| failure | SanitizedFailure/null | Código estável e mensagem sem segredos |

Transições: `CREATED -> RUNNING`; `RUNNING ->` um estado terminal. `COMPLETED_WITH_SELECTION`
exige exatamente um produto selecionado. `COMPLETED_NO_SELECTION` exige escopo completo e zero
candidato válido. `INCOMPLETE`, `FAILED`, `INTERRUPTED` e `SKIPPED_OVERLAP` não podem conter seleção.

### CategoryProcessingResult

| Field | Type | Rules |
|---|---|---|
| categoryId | String | Deve pertencer ao snapshot da política |
| status | Enum | `PROCESSED_WITH_RANKING`, `PROCESSED_NO_RANKING`, `UNAVAILABLE` |
| referenceCount | Integer | 0–20 |
| observedAt | Instant/null | Obrigatório quando consultada |
| failureCode | String/null | Sanitizado; obrigatório somente em `UNAVAILABLE` |

`PROCESSED_NO_RANKING` só decorre da resposta oficial específica para categoria folha validada.
Qualquer falha técnica, resposta parcial/malformada ou contrato inesperado resulta em
`UNAVAILABLE` e status de execução `INCOMPLETE`.

### CategoryCandidateReference

Representa uma posição em um ranking; não duplica a avaliação de produto.

| Field | Type | Rules |
|---|---|---|
| categoryId | String | Categoria folha descoberta e selecionada para a execução |
| effectivePosition | Positive integer | Posição usada pelo domínio: posição oficial se fornecida; senão índice estável 1–20 na lista |
| reportedPosition | Positive integer/null | Posição explícita fornecida pela API, se houver |
| referenceType | Enum | `ITEM`, `PRODUCT` ou `USER_PRODUCT` |
| sourceId | String | ID oficial devolvido no ranking |
| assessmentKey | String/null | Produto/variação normalizado; null até resolução |
| observedAt | Instant | Instante da observação |

Entradas de uma categoria são ordenadas por `effectivePosition` ascendente. Posições explícitas
repetidas/inconsistentes, ou referências sem posição que não possam ser ordenadas pela lista,
tornam a categoria indisponível. Uma referência não resolvível é rejeitada com motivo estável,
sem scraping.

### OfferAssessment

Retrato normalizado e decisão comercial única por produto/variação.

| Field | Type | Rules |
|---|---|---|
| productId / variationKey | String | `variationKey` usa sentinela `NO_VARIATION`; nunca nulo |
| canonicalKey | String | `<productId>:<variationKey>`; única por execução |
| categoryReferences | CategoryCandidateReference[] | Todas as memberships/posições observadas |
| capturedAt | Instant | Instante do retrato inicial |
| title | String | Trimado e não vazio |
| condition / available | Enum/Boolean | Para qualificação inicial, condição `NEW` e disponível |
| currency | ISO 4217 string | Igual à política |
| originalPrice / discountedPrice | Decimal money | Positivos e desconto menor que original |
| discountAmount / discountPercent | Decimal | Calculados sem substituir valores observados |
| salesEvidence | SalesEvidence | Ranking oficial associado à membership da categoria |
| imageUrl | HTTPS URL | Imagem principal correspondente ao produto/variação |
| affiliateEvidence | AffiliateEvidence/null | Obrigatória para qualificação |
| outcome | Enum | `QUALIFIED` ou `REJECTED` |
| reasonCodes | String set | Vazio se qualificado; não vazio se rejeitado |
| revalidation | RevalidationSnapshot/null | Dados e instante da última validação |

### SalesEvidence

| Field | Type | Rules |
|---|---|---|
| kind | Enum | `BEST_SELLER_RANK` |
| position | Positive integer | `effectivePosition`; comparável somente dentro do mesmo `categoryId` |
| source | String | Operação oficial de ranking |
| observedAt | Instant | Obrigatório |

Posições nunca são comparadas entre categorias. O produto é descrito como candidato qualificado
mais bem posicionado (posição N), não como mais vendido global ou necessariamente posição 1.

### AffiliateEvidence

| Field | Type | Rules |
|---|---|---|
| productId / variationKey | String | Devem coincidir com a oferta |
| eligible | Boolean | Deve ser `true` |
| affiliateUrl | HTTPS URL | Destino validado para o mesmo produto/variação |
| commissionPercent | Decimal percent | Maior que zero e menor ou igual a 100 |
| expectedCommissionAmount | Decimal money/null | Quando informado, reconcilia com preço vigente |
| capturedAt | Instant | Não pode estar no futuro |
| validUntil | Instant/null | Limite declarado pela fonte, se houver |
| effectiveExpiresAt | Instant | `min(validUntil, capturedAt + 1 hora)`; usa `capturedAt + 1 hora` se não houver validade declarada |
| source | Enum | `CENTRAL_MANUAL` no primeiro release |
| sourceReference / fingerprint | String | Referência auditável e hash canônico, sem credenciais |

Elegibilidade é válida somente enquanto `now < effectiveExpiresAt`; no instante limite, está
expirada. O domínio recebe `Clock` por porta para a validação inicial e imediatamente antes da
finalização.

### CategoryCandidateQueue and LeaderSelection

Cada fila contém avaliações qualificadas da categoria ordenadas por posição oficial ascendente.
Somente a cabeça revalidada representa o líder corrente. O vencedor provisório é o menor segundo a
ordem: `discountPercent DESC`, `expectedCommissionAmount DESC`, `categoryId ASC`. O ID da categoria
é desempate determinístico e não indica mérito comercial.

Se uma mudança confirmada invalidar o vencedor provisório, ele é removido e o próximo candidato da
mesma categoria é revalidado; o torneio é recalculado. Se valores de preço/desconto/comissão mudarem
mas o candidato continuar qualificado, atualiza-se o snapshot e recalcula-se o torneio. Falha
técnica inconclusiva interrompe com `INCOMPLETE`, sem seleção. Uma avaliação compartilhada entre
categorias é invalidada em todas as filas em que participa.

### SelectedProduct

| Field | Type | Rules |
|---|---|---|
| productId / variationKey | String | Mesma avaliação qualificada |
| categoryId / categoryPosition | String/positive integer | Membership que venceu o torneio |
| title / ticketBand | String/Enum | Título não vazio; `LOW` ou `MEDIUM` |
| prices | Money fields | Original, promocional, valor e percentual de desconto coerentes |
| affiliateUrl / commission | URL and decimals | Válidos e revalidados; indicar campos derivados |
| mainImageUrl | HTTPS URL | Mesmo produto/variação |
| salesEvidence | SalesEvidence | Ranking da categoria vencedora |
| selectionRationale | String list | Inclui comparação comercial e promoções por revalidação |
| capturedAt / validatedAt | Instant | `validatedAt` satisfaz TTL e freshness |

## Relational Model When Persistence Is Enabled

### `research_execution`

UUID PK, `execution_key` UNIQUE, `run_id` UNIQUE, modo/status com CHECK, snapshot e fingerprint de
política, instantes `timestamptz`, contagens não negativas, `category_coverage jsonb` com IDs e
estados por categoria, e falha sanitizada opcional. `finished_at` é obrigatório para estados
terminais e indexado para a rotina de retenção; nunca se usa `started_at` para expirar execuções
`RUNNING`.

### `category_candidate_reference`

UUID PK, execução FK `ON DELETE CASCADE`, `category_id`, `effective_position` positiva, `reported_position` opcional,
tipo oficial, ID da origem, chave canônica resolvida opcional e instante. UNIQUE
`(execution_id, category_id, effective_position)` e UNIQUE
`(execution_id, category_id, reference_type, source_id)`. Indexar execução/categoria/posição para
reconstruir filas ordenadas.

### `evaluated_offer`

UUID PK, execução FK `ON DELETE CASCADE`, IDs de produto/variação, chave canônica, retrato comercial, preços em
`numeric(14,2)`, percentuais em `numeric(7,4)`, evidência afiliada e de vendas sanitizadas,
resultado/motivos e snapshot de revalidação. UNIQUE `(execution_id, canonical_key)`.

### `selected_product`

`execution_id` PK/FK `ON DELETE CASCADE` garante no máximo uma seleção. FK para avaliação,
`category_id`, posição,
snapshot final validado contra o contrato e justificativa não vazia. A transação final garante que a
membership selecionada pertence à execução e à avaliação.

## Persistence Transactions

1. `begin(execution)` insere ou lê por `execution_key` em transação curta.
2. Chamadas externas e avaliação ocorrem sem transação aberta.
3. `complete(aggregate)` grava resultados de categoria, referências, avaliações, seleção opcional e
   contagens em uma única transação usando o entity manager transacional.
4. `fail(execution, sanitizedFailure)` registra falha em transação curta.
5. No bootstrap, execuções `RUNNING` antigas passam a `INTERRUPTED`.
6. Repetição idêntica retorna o resultado existente; conteúdo incompatível para a mesma chave gera
   conflito de idempotência e não sobrescreve auditoria.
7. Ao tornar uma execução terminal, preencher `finished_at`; reconciliar RUNNING para INTERRUPTED
   também define esse timestamp.
8. `purgeExpired(cutoff)` seleciona e remove em uma única transação somente execuções terminais com
   `finished_at <= cutoff`; a exclusão do agregado raiz aciona as FKs em cascata.

## Behavior When Persistence Is Disabled

- `ResearchExecutionStore` resolve para `NoopResearchExecutionStore`.
- Nenhum provider TypeORM, `DataSource`, pool, entidade ou migration é inicializado.
- Cada operação retorna `persistenceStatus: DISABLED` e não retém dados após a execução.
- O resumo estruturado mantém contagens e cobertura de categorias sem expor segredos.
- Regras de domínio e contrato final são idênticos ao caminho PostgreSQL.

## Retention and Sensitive Data

Quando a persistência estiver ativa, reter a execução e todo o agregado por 90 dias contados de
`finished_at`. Um adapter de manutenção apaga em uma única transação execuções terminais cujo
`finished_at <= cutoff`, sendo `cutoff` o instante de início da limpeza menos 90 dias; FKs em cascata
apagam referências, avaliações, links de afiliado e seleção sem deixar fragmentos. Um índice em
`finished_at` suporta a seleção dos expirados. No startup, primeiro reconcilia execuções RUNNING
abandonadas como INTERRUPTED e então aguarda o purge inicial antes de habilitar pesquisa em qualquer
modo. Falha no purge inicial aborta o bootstrap; falhas nas tentativas horárias em UTC são
estruturadas em log e repetidas na próxima hora. Uma indisponibilidade posterga o purge até o
startup, que ocorre antes de nova pesquisa. Execuções RUNNING não expiram. Com persistência
desligada não há retenção. Tokens OAuth, cookies, senhas, headers crus, estado de navegador e
payloads não sanitizados nunca são persistidos. URLs afiliadas podem ser armazenadas como link de
compartilhamento, mas logs usam apenas identidade e fingerprint.

## Pre-push Tooling Impact

O hook `pre-push` não cria entidade, value object, tabela, migration, estado de domínio nem dado
persistido. Seus únicos artefatos são configuração de desenvolvimento versionada (`package.json`,
`package-lock.json` e `.husky/`). O resultado do gate é efêmero e representado apenas pelo código de
saída: zero permite continuar o push; qualquer valor diferente de zero o bloqueia.
