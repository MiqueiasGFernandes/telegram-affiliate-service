# Implementation Plan: Artefatos de Deployment do Backend

**Branch**: `002-deployment-platform` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-deployment-platform/spec.md`

## Summary

Fornecer um DDL SQL autocontido que prepare um PostgreSQL vazio para a persistência atual do serviço e uma imagem Docker reproduzível para executar o backend. O DDL refletirá as migrations existentes, incluindo o ledger TypeORM para que o status de migrations continue coerente. O Dockerfile fará build multi-stage com Node.js 24, dependências de produção no estágio final, usuário sem privilégios e comando `node dist/main.js`. O banco continuará externo e será preparado antes do container iniciar; a imagem não rodará migrations nem abrirá porta HTTP.

## Technical Context

**Language/Version**: TypeScript 6.x compilado para JavaScript ESM; Node.js 24 ou superior no build e runtime.

**Primary Dependencies**: NestJS 12, TypeORM 0.3, `pg`, npm e imagem oficial `node:24-bookworm-slim`.

**Storage**: PostgreSQL 18 externo quando `PERSISTENCE_ENABLED=true`; o DDL representa `research_execution`, `category_processing_result`, `category_candidate_reference`, `evaluated_offer`, `selected_product`, índice de retenção e estado das migrations TypeORM. Com persistência desligada, banco é opcional.

**Testing**: PostgreSQL real via Docker Compose e Vitest; o guia de validação documentará build da imagem, verificação de usuário/comando e aplicação do DDL seguida da verificação do status das migrations.

**Target Platform**: Imagem OCI para Linux em plataformas de containers, sem acoplamento a provedor. Builds multi-arquitetura podem ser feitos pela plataforma de build.

**Project Type**: Processo Node.js standalone e residente, sem API HTTP.

**Performance Goals**: Não introduzir overhead significativo de startup; tamanho final deve excluir compilador, dependências de desenvolvimento e código-fonte TypeScript.

**Constraints**: Uma réplica ativa por ambiente; PostgreSQL provisionado separadamente; sem segredos na imagem; sem migração automática no startup; `DATABASE_URL` exigida somente com persistência ativa; configuração do scheduler e integrações segue externa; processo deve receber SIGTERM diretamente e permitir shutdown Nest existente. A imagem define o caminho padrão da evidência manual em `/etc/secrets/affiliate-evidence.json`, permite override por ambiente e inclui o usuário `node` no grupo 1000 para leitura do Secret File do Render.

**Scale/Scope**: Dois artefatos operacionais: SQL de bootstrap para banco vazio e imagem única da aplicação; sem Compose de produção, manifesto de provedor, pipeline de publicação ou imagem do PostgreSQL.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Regra constitucional aplicável | Status | Evidência / tratamento |
|---|---|---|
| Segurança e menor privilégio | PASS | Imagem final roda como usuário `node`; configurações e credenciais entram por ambiente/secret manager, sem inclusão no build context. |
| Automação idempotente e tolerante a falhas | PASS | O DDL se destina a banco vazio, em transação, e registra o estado exato das migrations para evitar repetição acidental pelo TypeORM; serviço permanece single-instance. |
| Observabilidade sem exposição de dados | PASS | O container mantém logs JSON sanitizados já existentes e não imprime env vars; falha de startup mantém mensagem genérica sanitizada. |
| Integrações e regras de negócio preservadas | PASS | Nenhuma interface HTTP é criada; imagem inicia o `AppModule` atual e recebe dependências externas por configuração. |
| Migrations explícitas e schema controlado | PASS | `synchronize` e `migrationsRun` permanecem desabilitados. SQL de bootstrap e migrations devem compartilhar versão e validação. |
| Operação de scheduler | PASS | Guia exige uma réplica, configuração cron/fuso e evidência externa montada em caminho absoluto. |
| Fluxo de desenvolvimento e qualidade | PASS | DDL será validado contra banco PostgreSQL vazio e imagem será construída/inspecionada; nenhum gate existente será relaxado. |

**Gate result**: PASS. A necessidade de DDL legível para provisionamento justifica manter um artefato SQL junto das migrations; controle de sincronização é tratado como requisito e validação.

### Post-Design Gate

**Status: PASS**. O DDL cria exatamente o modelo físico das migrations atuais e semeia o ledger TypeORM com seus nomes e timestamps; executar `migration:status` após bootstrap confirma que não há migration pendente. A imagem copia apenas saída compilada, dependências de produção e metadados necessários, roda sem root e não contém credenciais nem dados de evidência. O banco é externo, não há endpoint de health check HTTP e operação de produção mantém uma réplica. SQL é de bootstrap em banco vazio; atualizações de schema continuam sendo evolução versionada das migrations e do script SQL.

## Project Structure

### Documentation (this feature)

```text
specs/002-deployment-platform/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── database-schema.md
    └── container-image.md
```

### Source Code (repository root)

```text
Dockerfile
.dockerignore
database/
└── schema.sql
scripts/
└── run-migrations.ts
src/
├── main.ts
└── modules/affiliate-research/infrastructure/persistence/postgres/
    ├── data-source.ts
    ├── initial-schema.migration.ts
    └── retention-schema.migration.ts
```

**Structure Decision**: manter o SQL de bootstrap em `database/schema.sql`, o Dockerfile e `.dockerignore` na raiz, e migrations TypeORM existentes como mecanismo versionado de evolução. Nenhum novo serviço ou processo é introduzido. Os contratos especificam aplicação em banco vazio e interface de execução da imagem.

## Complexity Tracking

Sem violações constitucionais ou componentes adicionais.
