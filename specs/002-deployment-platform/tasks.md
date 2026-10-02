---
description: "Tarefas de implementação dos artefatos de deployment do backend"
---

# Tasks: Artefatos de Deployment do Backend

**Input**: Design documents from `/specs/002-deployment-platform/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Nenhuma nova suíte automatizada foi solicitada. Os critérios independentes de validação estão registrados por história; a etapa final executa o quickstart em ambiente descartável.

**Organization**: Tarefas agrupadas por história, seguindo a prioridade e a ordem de entrega solicitada: DDL primeiro, imagem em seguida.

## Phase 1: Setup

**Purpose**: Preparação compartilhada do projeto.

O repositório já possui estrutura Node/NestJS, lockfile npm, configuração PostgreSQL e migrations. Não são necessárias tarefas de inicialização nem novas dependências.

## Phase 2: Foundational

**Purpose**: Pré-requisitos compartilhados que bloqueiam as histórias.

Não há nova infraestrutura compartilhada a criar. As migrations existentes e o contrato de configuração são a base para as tarefas de cada história.

---

## Phase 3: User Story 1 - Provisionar o schema PostgreSQL (Priority: P1) 🎯 MVP

**Goal**: Entregar DDL transacional para preparar um PostgreSQL vazio e deixar o TypeORM reconhecer as migrations atuais como aplicadas.

**Independent Test**: Aplicar o SQL em PostgreSQL vazio; verificar as cinco tabelas de aplicação, suas relações, checks e índice de retenção; executar `npm run migration:status` e confirmar que não há migrations pendentes.

### Implementation for User Story 1

- [X] T001 [US1] Criar `database/schema.sql` reproduzindo exatamente as tabelas e constraints de `src/modules/affiliate-research/infrastructure/persistence/postgres/initial-schema.migration.ts` e `retention-schema.migration.ts`; criar a tabela TypeORM `migrations` e registrar `InitialSchema20261001000000` com timestamp `20261001000000` e `RetentionSchema20261001010000` com timestamp `20261001010000` na mesma transação, sem `IF NOT EXISTS` ou operações destrutivas.

**Checkpoint**: O DDL provisiona um banco vazio e o mecanismo existente informa as duas migrations como concluídas. Este é o MVP solicitado.

---

## Phase 4: User Story 2 - Construir e executar a imagem do backend (Priority: P2)

**Goal**: Entregar imagem OCI reproduzível, compacta e sem privilégios para executar o processo residente em uma plataforma de containers.

**Independent Test**: Construir a imagem, inspecionar usuário/comando/portas e iniciar com ambiente válido, schema previamente preparado e evidência manual montada; confirmar logs sanitizados, ausência de DDL automático e shutdown controlado por SIGTERM.

### Implementation for User Story 2

- [X] T002 [US2] Criar `Dockerfile` multi-stage com `node:24-bookworm-slim`, instalação reproduzível por `npm ci`, compilação via `npm run build`, instalação separada de dependências de produção com `npm ci --omit=dev`, cópia somente de `dist/`, `node_modules` de produção e metadados necessários, `NODE_ENV=production`, usuário `node` e comando exec `node dist/main.js`; não declarar porta nem executar migrations no startup.
- [X] T003 [P] [US2] Criar `.dockerignore` na raiz excluindo `.git/`, `node_modules/`, `dist/`, testes, artefatos Spec Kit, arquivos `.env*`, credenciais, arquivos de evidência e outros dados locais que não pertencem ao contexto de build.
- [X] T004 [US2] Atualizar a seção de deployment em `README.md` com build da imagem, injeção externa de configuração/segredos, montagem somente leitura do arquivo de evidência, aplicação prévia do DDL ou migrations, requisito de uma réplica, ausência de porta HTTP e encerramento por SIGTERM; manter as instruções independentes de provedor.

**Checkpoint**: A imagem inicia o backend já provisionado sem modificar o schema, sem expor porta HTTP e com encerramento gracioso.

---

## Phase 5: Polish & Cross-Cutting Validation

**Purpose**: Conferir a sequência completa e a documentação operacional.

- [X] T005 Executar os cenários de `specs/002-deployment-platform/quickstart.md` em banco descartável e imagem local; comparar o SQL com ambas as migrations, confirmar ausência de migrations pendentes, usuário/comando/portas esperados na imagem e corrigir divergências em `database/schema.sql`, `Dockerfile`, `.dockerignore` ou `README.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Já satisfeito pela estrutura e ferramentas existentes.
- **Foundational (Phase 2)**: Já satisfeito pelas migrations, configuração e scripts atuais.
- **User Story 1 (Phase 3)**: Pode iniciar imediatamente; é o MVP.
- **User Story 2 (Phase 4)**: Começa após a conclusão do DDL da US1 para respeitar a ordem solicitada de provisionamento antes da imagem.
- **Polish (Phase 5)**: Depende de US1 e US2 concluídas.

### User Story Dependencies

- **US1 (P1)**: Sem dependências novas; define o primeiro artefato entregável.
- **US2 (P2)**: Depende de US1 por ordem de entrega operacional; não altera nem incorpora o banco à imagem.

### Parallel Opportunities

- Dentro da US2, T002 (`Dockerfile`) e T003 (`.dockerignore`) podem ser feitos em paralelo por alterarem arquivos distintos.
- T004 depende das decisões finais de T002/T003 para documentar comandos e comportamento reais.
- T005 é sequencial e valida o conjunto completo.

## Parallel Example: User Story 2

```text
Após US1:
Task: T002 - Criar Dockerfile multi-stage na raiz
Task: T003 - Criar .dockerignore na raiz
```

## Implementation Strategy

### MVP First

1. Concluir T001 e validar o DDL em banco PostgreSQL vazio.
2. Conferir que `npm run migration:status` não aponta migrations pendentes.
3. Se o provisionamento do banco já for suficiente para a primeira entrega, parar nesse checkpoint; a imagem fica para a etapa seguinte.

### Incremental Delivery

1. Entregar US1: SQL de bootstrap consistente com o ledger TypeORM.
2. Entregar US2: imagem Node de produção e documentação de operação.
3. Executar T005 em conjunto para validar DDL e imagem pela sequência operacional completa.

## Notes

- `[P]` indica tarefas em arquivos distintos sem dependência entre si.
- `[US1]` e `[US2]` identificam a história coberta.
- O DDL é somente para banco vazio; instalações existentes devem usar as migrations versionadas.
- O container depende de configuração e secrets fornecidos pelo ambiente e nunca deve conter evidência afiliada ou credenciais.
