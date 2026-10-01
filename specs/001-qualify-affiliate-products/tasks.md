# Tasks: Pesquisa e Seleção de Produtos Afiliados

**Input**: `specs/001-qualify-affiliate-products/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Organization**: tarefas agrupadas pelas três histórias da especificação. Testes estão incluídos porque os critérios de aceite e a constituição exigem validação unitária, de contratos e E2E controlada.

**Progress preservation**: T001–T067 permanecem concluídas. Esta atualização acrescenta somente T068–T071 para detalhar e validar o README; o trabalho documental não altera funcionalidades do produto.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicializar o monólito NestJS/TypeScript e as ferramentas comuns.

- [X] T001 Inicializar pacote npm e scripts de build, lint, typecheck, testes e execução em `package.json` e `package-lock.json`
- [X] T002 [P] Configurar TypeScript estrito e paths de compilação em `tsconfig.json` e `tsconfig.build.json`
- [X] T003 [P] Configurar ESLint, Prettier e regras de importação em `eslint.config.mjs` e `.prettierrc.json`
- [X] T004 Criar bootstrap standalone sem listener HTTP em `src/main.ts` e composition root em `src/app.module.ts`
- [X] T005 [P] Criar configuração Vitest para unit, contract, integration, architecture e E2E em `vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configuração validada, limites arquiteturais e contratos técnicos compartilhados; bloqueia as histórias.

- [X] T006 Implementar parsing tipado de ENV e validação de `SCHEDULE_CRON` e `SCHEDULE_TIMEZONE` obrigatórios em todos os modos em `src/platform/config/`
- [X] T007 [P] Validar `PERSISTENCE_ENABLED` como somente `true`/`false` (default `false`), URL PostgreSQL condicional, política comercial e 1–10 IDs MLB únicos em `src/platform/config/`
- [X] T008 Criar tokens de DI e portas de entrada/saída para relógio, logs, persistência e provedores externos em `src/modules/affiliate-research/application/ports/`
- [X] T009 Criar value objects de dinheiro, percentual, moeda, categoria MLB e chave canônica em `src/modules/affiliate-research/domain/value-objects/`
- [X] T010 Criar `QualificationPolicy` imutável com limites inclusivos, faixas não sobrepostas e fingerprint determinístico em `src/modules/affiliate-research/domain/policies/`
- [X] T011 Criar aggregate `ResearchExecution`, status, contagens e invariantes de transição em `src/modules/affiliate-research/domain/entities/`
- [X] T012 [P] Configurar regras de dependência para proibir imports de Nest/infraestrutura no domínio/aplicação e ciclos entre módulos em `.dependency-cruiser.cjs`
- [X] T013 Testar configuração inválida/ausente e regras de arquitetura, incluindo ausência de servidor HTTP, em `test/architecture/` e `test/unit/platform/config/`
- [X] T014 Compor `AffiliateResearchModule` exportando apenas input port e resultado público em `src/modules/affiliate-research/affiliate-research.module.ts`

**Checkpoint**: Bootstrap, configuração e limites arquiteturais prontos antes das histórias.

---

## Phase 3: User Story 1 - Qualificar ofertas de baixo e médio ticket (Priority: P1) 🎯 MVP

**Goal**: Consultar todas as categorias configuradas, avaliar cada produto/variação única e reter ofertas qualificadas com motivo auditável.

**Independent Test**: Executar a pesquisa contra adapters/fixtures conhecidos; conferir qualificações, rejeições e completude de categoria sem exigir seleção final ou publicação.

### Tests for User Story 1

- [X] T015 [P] [US1] Testar limites de ticket inclusivos, desconto mínimo, consistência de preços, comissão e motivos de rejeição em `test/unit/affiliate-research/domain/qualification-policy.spec.ts`
- [X] T016 [P] [US1] Testar deduplicação por produto/variação mantendo memberships e posições em `test/unit/affiliate-research/domain/offer-assessment.spec.ts`
- [X] T017 [P] [US1] Testar contrato de categoria folha e resultados ranking disponível/sem ranking/indisponível em `test/contract/mercado-livre-gateway.contract.spec.ts`
- [X] T018 [P] [US1] Testar leitura, vínculo, fingerprint e expiração de evidência manual de 1 hora em `test/contract/affiliate-evidence.contract.spec.ts`
- [X] T019 [P] [US1] Testar pesquisa de 1–10 categorias, até 20 referências por categoria, ordem efetiva por posição explícita ou índice estável e falha incompleta em `test/integration/affiliate-research/qualification.integration.spec.ts`

### Implementation for User Story 1

- [X] T020 [US1] Implementar `CategoryProcessingResult` e referência de ranking com `effectivePosition` e `reportedPosition` opcionais em `src/modules/affiliate-research/domain/entities/`
- [X] T021 [US1] Implementar normalização e validação dos campos comerciais, com moeda igual à política, preços positivos e desconto menor que preço original em `src/modules/affiliate-research/domain/services/`
- [X] T022 [US1] Implementar avaliação de oferta: condição `NEW`, disponibilidade, ticket, desconto mínimo, evidência de venda, título, imagem e evidência afiliada válidos em `src/modules/affiliate-research/domain/services/`
- [X] T023 [US1] Implementar adapter OAuth e cliente oficial Mercado Livre com timeout explícito, concorrência limitada e retry limitado respeitando `Retry-After` em `src/modules/affiliate-research/infrastructure/mercado-livre/`
- [X] T024 [US1] Implementar validação oficial das categorias MLB folha antes das consultas de ranking em `src/modules/affiliate-research/infrastructure/mercado-livre/`
- [X] T025 [US1] Implementar consulta e resolução oficial de `ITEM`, `PRODUCT` e `USER_PRODUCT`, sem navegador, scraping ou endpoint não documentado, em `src/modules/affiliate-research/infrastructure/mercado-livre/`
- [X] T026 [US1] Implementar adapter de evidências `manual-file`, impondo expiração efetiva `min(validUntil, capturedAt + 1 hora)` em `src/modules/affiliate-research/infrastructure/affiliate-evidence/`
- [X] T027 [US1] Implementar caso de uso de pesquisa que consome todas as referências de 1–10 categorias, deduplica avaliações e marca ausência oficial de ranking como processada em `src/modules/affiliate-research/application/use-cases/run-affiliate-research.use-case.ts`
- [X] T028 [US1] Implementar classificação final de execução como incompleta sem seleção quando qualquer categoria falhar tecnicamente, parcialmente ou por contrato inválido no mesmo caso de uso em `src/modules/affiliate-research/application/use-cases/run-affiliate-research.use-case.ts`
- [X] T029 [US1] Criar fixtures sanitizadas de categorias, rankings, referências e evidências sem credenciais reais em `test/fixtures/affiliate-research/`

**Checkpoint**: US1 qualificável e demonstrável sem banco, scheduler ou chamadas live.

---

## Phase 4: User Story 2 - Selecionar um líder de categoria elegível (Priority: P2)

**Goal**: Promover um líder por categoria, revalidar e escolher no máximo um produto por desconto, comissão e ID da categoria.

**Independent Test**: Fornecer rankings e snapshots controlados; verificar líder por posição efetiva, torneio determinístico, promoções e ausência de seleção em falha técnica.

### Tests for User Story 2

- [X] T030 [P] [US2] Testar ordenação de filas por posição dentro da categoria e desempate do torneio por desconto desc., comissão desc. e categoria asc. em `test/unit/affiliate-research/domain/leader-selection.spec.ts`
- [X] T031 [P] [US2] Testar invalidação confirmada, promoção sucessiva, atualização de métricas e falha técnica de revalidação em `test/unit/affiliate-research/domain/revalidation.spec.ts`
- [X] T032 [P] [US2] Testar que ranking ausente oficial é completo, mas qualquer categoria indisponível impede seleção em `test/integration/affiliate-research/selection.integration.spec.ts`

### Implementation for User Story 2

- [X] T033 [US2] Implementar filas de candidatos qualificados por categoria usando somente evidência comparável dentro da categoria em `src/modules/affiliate-research/domain/services/`
- [X] T034 [US2] Implementar torneio de líderes com ordem exata `discountPercent DESC`, `expectedCommissionAmount DESC`, `categoryId ASC` em `src/modules/affiliate-research/domain/services/`
- [X] T035 [US2] Implementar revalidação oficial de preço, disponibilidade, imagem, evidência afiliada e destino do link em `src/modules/affiliate-research/infrastructure/mercado-livre/` e `src/modules/affiliate-research/infrastructure/affiliate-evidence/`
- [X] T036 [US2] Implementar promoção e revalidação do próximo candidato da categoria após mudança confirmada e recalcular torneio até seleção ou esgotamento em `src/modules/affiliate-research/application/use-cases/run-affiliate-research.use-case.ts`
- [X] T037 [US2] Impedir produto selecionado em execução incompleta e exigir exatamente um selecionado em `COMPLETED_WITH_SELECTION` em `src/modules/affiliate-research/domain/entities/`

**Checkpoint**: US2 seleciona de modo reproduzível e jamais declara ranking global entre categorias.

---

## Phase 5: User Story 3 - Entregar dados completos para divulgação (Priority: P3)

**Goal**: Entregar produto completo, coerente, rastreável e opcionalmente persistido, sem gerar conteúdo nem publicar.

**Independent Test**: Validar schema do pacote contra seleção válida; testar campos ausentes, comissão derivada, persistência ligada/desligada e execução uma vez/agendada.

### Tests for User Story 3

- [X] T038 [P] [US3] Validar resultado terminal e cobertura por categoria contra `run-summary.schema.json` em `test/contract/run-summary.contract.spec.ts`
- [X] T039 [P] [US3] Validar pacote completo, categoria/posição efetiva, evidência e campos derivados contra `selected-product.schema.json` em `test/contract/selected-product.contract.spec.ts`
- [X] T040 [P] [US3] Testar que o provider no-op não inicializa `DataSource` mesmo com URL inalcançável em `test/integration/affiliate-research/persistence-disabled.integration.spec.ts`
- [X] T041 [P] [US3] Testar migrations, constraints, transação final, idempotência e interrupção no PostgreSQL real em `test/e2e/postgres-persistence.e2e.spec.ts`
- [X] T042 [P] [US3] Testar validação cron/fuso em todos os modos, execução única, job único e descarte de sobreposição em `test/integration/affiliate-research/scheduler.integration.spec.ts`

### Implementation for User Story 3

- [X] T043 [US3] Gerar `SelectedProduct` apenas com todos os campos requeridos e registrar `categoryId`, posição efetiva e justificativa rastreável em `src/modules/affiliate-research/domain/entities/`
- [X] T044 [US3] Serializar resumo terminal com duração, contagens, cobertura de categorias e falha sanitizada em `src/platform/observability/`
- [X] T045 [US3] Implementar store no-op sem importar/inicializar TypeORM, `DataSource` ou pool quando `PERSISTENCE_ENABLED=false` em `src/modules/affiliate-research/infrastructure/persistence/noop/`
- [X] T046 [US3] Implementar snapshot persistido de política, execuções, categorias, referências, avaliações e seleção, migrations versionadas e transações de begin/complete/fail/interrupted quando persistência estiver ligada em `src/modules/affiliate-research/infrastructure/persistence/postgres/`
- [X] T047 [US3] Registrar condicionalmente o módulo PostgreSQL e escolher store por factory provider sem fallback silencioso em `src/app.module.ts` e `src/modules/affiliate-research/affiliate-research.module.ts`
- [X] T048 [US3] Implementar job único com cron/fuso validados, proteção contra sobreposição local e encerramento ordenado em `src/modules/affiliate-research/infrastructure/scheduler/affiliate-research.job.ts`
- [X] T049 [US3] Implementar modo `once` e modo scheduler residente reutilizando o mesmo caso de uso, sem criar servidor HTTP, em `src/main.ts`
- [X] T050 [US3] Criar Compose E2E autônomo com PostgreSQL 18 fixado por patch/digest, porta loopback dinâmica, healthcheck e volume isolado em `compose.e2e.yaml`
- [X] T051 [US3] Implementar ciclo Compose de E2E com project name exclusivo, migrations, captura de diagnóstico, teardown em finally e preservação de exit code em `scripts/run-e2e.mjs`
- [X] T052 [US3] Expor `test:e2e` para o runner standalone com `PERSISTENCE_ENABLED=true` e ambiente isolado em `package.json`

### Clarification follow-up — retenção e recuperação

- [X] T053 [P] [US3] Escrever testes de integração para tentativa horária UTC sem sobreposição e falhas sanitizadas; o factory do store aguarda a limpeza de startup antes de retornar, bloqueando bootstrap em caso de falha em `test/integration/affiliate-research/retention-maintenance.integration.spec.ts`
- [X] T054 [P] [US3] Escrever testes PostgreSQL Compose para `finished_at <= cutoff` no corte exato, cascata de execução para categorias/referências/ofertas/seleção, retenção de execuções não vencidas e exclusão nunca aplicada a `RUNNING` em `test/e2e/postgres-retention.e2e.spec.ts`
- [X] T055 [US3] Adicionar `purgeExpired(cutoff: Date): Promise<number>` à porta `ResearchExecutionStorePort` e implementá-la como no-op sem retenção quando persistência estiver desligada em `src/modules/affiliate-research/application/ports/out/research-ports.ts` e `src/modules/affiliate-research/infrastructure/persistence/noop/noop-research-execution.store.ts`
- [X] T056 [P] [US3] Criar migration PostgreSQL versionada com índice em `research_execution.finished_at` e constraint de ciclo de vida: `finished_at` é obrigatório para todos os estados terminais e nulo somente em `RUNNING` em `src/modules/affiliate-research/infrastructure/persistence/postgres/retention-schema.migration.ts`
- [X] T057 [US3] Implementar `purgeExpired(cutoff)` com transação TypeORM e exclusão somente de execuções terminais cujo `finished_at <= cutoff`, usando o entity manager da transação e FKs `ON DELETE CASCADE` em `src/modules/affiliate-research/infrastructure/persistence/postgres/research-execution.store.ts`
- [X] T058 [US3] Implementar manutenção técnica somente no modo residente, com CronJob `0 * * * *` em UTC, trava contra ciclos sobrepostos, log JSON sanitizado em falha horária e encerramento ordenado em `src/modules/affiliate-research/infrastructure/scheduler/retention-maintenance.job.ts`
- [X] T059 [US3] Ordenar bootstrap PostgreSQL para reconciliar execuções `RUNNING` como `INTERRUPTED`, calcular cutoff de 90 dias e aguardar purge antes de qualquer cron ou execução `once`; propagar falha inicial para abortar bootstrap e registrar o erro sanitizado em `src/modules/affiliate-research/affiliate-research.module.ts` e `src/main.ts`

**Checkpoint**: US3 entrega resumo e pacote validados; persistência é opcional e o runtime continua sem API HTTP.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechar portas de qualidade e validar o quickstart completo.

- [X] T060 [P] Documentar variáveis ENV, execução segura e modo sem persistência em `.env.example` e `README.md`
- [X] T061 [P] Adicionar verificação de segredos no pipeline em `.github/workflows/ci.yml` e garantir sanitização de logs em `src/platform/observability/`
- [X] T062 Executar lint, typecheck, arquitetura, unit, contract, integration, E2E Compose e validar todos os exemplos do `specs/001-qualify-affiliate-products/quickstart.md`
- [X] T063 Revisar rastreabilidade FR-001–FR-029, invariantes do modelo e conformidade constitucional em `specs/001-qualify-affiliate-products/tasks.md`
- [X] T064 [P] Criar benchmark reproduzível com 100 amostras virtuais bem-sucedidas de 10 categorias × 20 referências, revalidação final, seed fixa e latências simuladas 50 ms (validação/ranking), 100 ms (resolução), 50 ms (imagem) e 100 ms (revalidação); validar pelo menos 95/100 abaixo de 600.000 ms e registrar p50/p95/máximo em `test/performance/affiliate-research.benchmark.spec.ts`
- [X] T065 [P] Adicionar o script `test:performance` para executar somente o benchmark por fixtures, sem chamadas live, em `package.json`
- [X] T066 Atualizar o quickstart para documentar retenção horária, precedência do purge inicial e benchmark; trocar o comando inexistente `migration:test` pelos scripts existentes `migration:run`/`migration:status` e incluir o novo `test:performance` em `specs/001-qualify-affiliate-products/quickstart.md`
- [X] T067 Executar typecheck, arquitetura, testes unitários/contrato/integração, E2E Compose e benchmark; validar FR-030–FR-033, SC-005, redaction e evidências de aceitação em `specs/001-qualify-affiliate-products/quickstart.md`

### README onboarding and production documentation

**Purpose**: explicar o produto e fornecer instruções verificadas para execução local e implantação genérica em produção, sem atribuir funcionalidades ou plataforma não existentes.

- [X] T068 Revisar a visão geral, arquitetura e escopo do produto em `README.md`, distinguindo seleção implementada das exclusões de login/scraping afiliado, geração promocional e publicação Telegram conforme `specs/001-qualify-affiliate-products/plan.md` e `specs/001-qualify-affiliate-products/spec.md`
- [X] T069 Documentar onboarding local copiável em `README.md`: Node.js 24+, `npm ci`, cópia e preenchimento de `.env.example`, export explícito das variáveis (o app não carrega `.env`), evidência manual, `config:check`, modos `start:once`/`start:scheduler` e configuração PostgreSQL/migrations conforme `specs/001-qualify-affiliate-products/quickstart.md`
- [X] T070 Documentar checklist genérico de produção em `README.md`: configuração/secrets e evidência manual fora do Git, build compilado, migrations em etapa release com `tsx`, `npm start`, retenção/toggle PostgreSQL, exatamente uma réplica, supervisão/SIGTERM e ausência de Dockerfile/manifesto/provedor de deploy no repositório
- [X] T071 Validar no `README.md` todos os comandos, caminhos e links relativos contra `package.json`, `.env.example`, `specs/001-qualify-affiliate-products/contracts/`, `specs/001-qualify-affiliate-products/quickstart.md` e scripts; confirmar que exemplos não contêm credenciais reais nem alegam licença, deploy automatizado ou postagem Telegram

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) não depende de outras fases.
- Foundational (Phase 2) depende da Setup e bloqueia as três histórias.
- US1 (Phase 3) depende da fundação e é o MVP de qualificação.
- US2 (Phase 4) depende de US1 porque seleciona e revalida os candidatos qualificados.
- US3 (Phase 5) depende de US2 para compor/persistir o produto final; seu resumo também reporta cobertura produzida por US1. T053–T059 completam retenção e recuperação antes do aceite operacional desta história.
- Polish (Phase 6) depende das histórias desejadas, com validação completa após US3. T064–T065 podem ser desenvolvidas em paralelo com retenção; documentação e validação final dependem de ambas.
- README onboarding (T068–T071) é trabalho documental transversal, independente de mudança runtime, mas suas tarefas são sequenciais porque atualizam/validam o mesmo `README.md`.

### User Story Dependencies

```text
Setup → Foundational → US1 (P1) → US2 (P2) → US3 (P3) → Polish
```

US2 e US3 têm dependência funcional real da saída anterior; portanto não são paralelizáveis entre si. Dentro de cada fase, tarefas `[P]` independem entre arquivos e podem ser executadas em paralelo após seus pré-requisitos.

### Parallel Opportunities

- Setup: T002, T003 e T005 podem correr em paralelo após T001.
- Foundational: T007 e T012 podem correr em paralelo com T009–T011; T013 começa quando a configuração e as regras de arquitetura existem.
- US1: T015–T019 são testes independentes; após contratos e domínio, adapters e fixtures em T023–T026/T029 podem ser divididos por arquivo/porta.
- US2: T030–T032 são testes independentes; T033–T035 são separáveis por domínio e adapter depois de US1.
- US3: T038–T042 são verificações independentes; T053 e T054 podem ser escritas em paralelo; T055 e T056 alteram arquivos distintos e podem avançar em paralelo. T057 depende de T055–T056; T058 depende de T055 e T057; T059 integra purge e jobs ao bootstrap após T057–T058.
- Polish: T064 e T065 alteram arquivos distintos e podem ser trabalhadas em paralelo; T066 depende do script de benchmark, e T067 depende de todas as tarefas pendentes.
- README: não há oportunidade segura de paralelismo entre T068–T071 porque todas alteram ou validam o mesmo arquivo e cada etapa depende das afirmações consolidadas na anterior.

### Parallel Example: User Story 1

```text
Após T014, executar em paralelo:
T015 testes de política | T016 testes de deduplicação | T017 contrato Mercado Livre |
T018 contrato de evidência | T019 integração da pesquisa
```

## Parallel Examples: User Stories 2 and 3

```text
US2, após a implementação inicial da US1:
T030 teste do torneio | T031 teste de revalidação | T032 teste de completude por categoria

US3, após os contratos e o modelo base:
T053 teste de lifecycle/cron | T054 teste PostgreSQL de retenção
T055 contrato/no-op de purge | T056 migration/index de retenção
```

### Implementation Strategy

1. Entregar Setup e Foundational, sem abrir porta HTTP e com configuração fail-fast.
2. Construir US1 como MVP: qualificação reproduzível, integrações oficiais e evidências manuais; validar isoladamente com fixtures.
3. Adicionar US2 para seleção e promoção de líderes com revalidação controlada.
4. Adicionar US3 para pacote final, scheduler e toggle de persistência; completar T053–T059 para garantir retenção de 90 dias, purge inicial fail-closed e manutenção horária.
5. Executar benchmark determinístico e Polish; validar caminho sem banco e E2E Compose com PostgreSQL. Geração de texto/imagem promocional e publicação no Telegram permanecem fora desta feature.
6. Concluir T068–T071 como follow-up documental: revisar escopo e arquitetura, publicar instruções locais e checklist de produção, depois validar comandos, links e segurança do README.
