# Quickstart Validation Guide

Este guia descreve como validar a implementação planejada de ponta a ponta. Os comandos passam a
existir durante a fase de implementação; este documento não contém código da aplicação.

## Prerequisites

- Node.js 24 LTS e npm compatível.
- Credenciais OAuth de uma aplicação Mercado Livre autorizada para as operações públicas usadas.
- A aplicação descobre automaticamente até 10 categorias folha MLB com maior volume de anúncios.
- Arquivo de evidência afiliada preenchido pela Central oficial e válido conforme
  [affiliate-evidence.schema.json](./contracts/affiliate-evidence.schema.json).
- Docker Engine e Docker Compose v2 para os E2E; PostgreSQL local não é necessário.

Não use senha, cookies, storage state de navegador ou endpoints internos. O arquivo `.env` local e
o arquivo de evidência devem estar ignorados pelo Git.

## Install and Static Gates

```bash
npm ci
npm run lint
npm run typecheck
npm run test:architecture
npm test
```

Expected outcome:

- dependências são instaladas pelo lockfile;
- lint, tipagem, fronteiras do monólito modular e testes unitários passam;
- domínio e aplicação não importam Nest, TypeORM ou infraestrutura;
- não existem ciclos, deep imports entre módulos ou imports não resolvidos;
- nenhuma aplicação HTTP é criada;
- os testes unitários não precisam de rede nem PostgreSQL.

## Validate the Pre-push Hook

O `npm ci` deve executar o `prepare` e instalar o Husky em um checkout Git de desenvolvimento.
Valide o contrato detalhado em [pre-push.md](./contracts/pre-push.md):

```bash
git config --get core.hooksPath
npm run check:pre-push
.husky/pre-push
```

Expected outcome:

- `core.hooksPath` aponta para o diretório interno administrado pelo Husky;
- o script e o hook executam lint, formato, tipos, arquitetura, testes unitários, de contrato e de
  integração e build, na ordem documentada;
- sucesso retorna zero e qualquer falha interrompe imediatamente com código diferente de zero;
- nenhuma etapa altera arquivos, inicia rede, exige PostgreSQL/Docker ou cria um push real;
- CI e `NODE_ENV=production` não tentam instalar hooks locais.

O caminho de falha deve ser validado com um executável `npm` temporário no `PATH` que retorne um
código não zero, removido ao final. Não faça commit nem push apenas para testar o hook. E2E,
benchmark completo e secret scan continuam na CI e devem ser validados separadamente.

## Prepare Manual Affiliate Evidence

1. Na Central de Afiliados, confirme manualmente que o produto e a variação são elegíveis.
2. Gere o link pela ferramenta oficial para a página individual do produto.
3. Registre percentual, valor exibido quando houver, coleta, validade e referência da evidência.
4. Valide o arquivo:

```bash
npm run contract:validate -- \
  specs/001-qualify-affiliate-products/contracts/affiliate-evidence.schema.json \
  /run/secrets/affiliate-evidence.json
```

Expected outcome: JSON Schema valida estrutura, formatos e campos obrigatórios. A rotina também
valida fingerprint, vínculo produto/variação, datas, expiração efetiva no menor entre `validUntil`
e `capturedAt + 1 hora`, intervalo percentual e reconciliação monetária. No instante de uma hora a
evidência já está expirada.

## Run Once Without Persistence

Configure o ambiente conforme [environment.md](./contracts/environment.md). Exemplo deliberadamente
sem valores comerciais ou segredos reais:

```dotenv
NODE_ENV=development
EXECUTION_MODE=once
SCHEDULE_CRON=<valid-cron-expression>
SCHEDULE_TIMEZONE=<valid-IANA-timezone>
PERSISTENCE_ENABLED=false
AFFILIATE_CURRENCY=BRL
LOW_TICKET_MIN=<decimal>
LOW_TICKET_MAX=<decimal>
MEDIUM_TICKET_MIN=<decimal>
MEDIUM_TICKET_MAX=<decimal>
MIN_DISCOUNT_PERCENT=<decimal>
MELI_CLIENT_ID=<secret>
MELI_CLIENT_SECRET=<secret>
MELI_REFRESH_TOKEN=<secret>
AFFILIATE_EVIDENCE_MODE=manual-file
AFFILIATE_EVIDENCE_FILE=/run/secrets/affiliate-evidence.json
```

Validate configuration and run the single routine:

```bash
npm run config:check
npm run start:once
```

Expected outcome:

- o contexto Nest inicia sem porta HTTP;
- nenhum driver, pool ou tentativa de conexão PostgreSQL é criado;
- a inicialização valida cron e timezone obrigatórios mesmo no modo `once`;
- antes do ranking, cada categoria selecionada automaticamente é validada oficialmente como folha MLB;
- exatamente uma execução processa todas as referências devolvidas por todas as categorias,
  qualifica, ordena e revalida;
- cada ranking contém até 20 referências; 10 categorias produzem até 200 sem truncamento;
- resposta oficial `NO_RANKING` conta como categoria processada sem candidatos;
- falha técnica, resposta parcial ou contrato inválido em qualquer categoria deixa a execução
  `INCOMPLETE` e sem produto selecionado;
- o evento final valida contra [run-summary.schema.json](./contracts/run-summary.schema.json);
- `persistence` é `DISABLED`;
- se houver seleção, o pacote valida contra
  [selected-product.schema.json](./contracts/selected-product.schema.json).

Repita com `DATABASE_URL` apontando de propósito para um host inalcançável. O resultado deve
continuar igual, provando que o modo desligado não toca o banco.

## Run Once With PostgreSQL

Prepare um banco vazio e acrescente:

```dotenv
PERSISTENCE_ENABLED=true
DATABASE_URL=<secret-postgresql-url>
DATABASE_SSL=<true-or-false>
```

Then run:

```bash
npm run migration:run
npm run migration:status
npm run start:once
```

Expected outcome:

- migrations são aplicadas antes da aplicação e nenhuma fica pendente;
- o bootstrap falha se `DATABASE_URL` estiver ausente ou inválida;
- uma execução, suas avaliações e no máximo uma seleção são gravadas;
- o resumo informa `persistence: SAVED`;
- repetir a mesma `executionKey` não duplica execução, oferta ou seleção.

Não use `synchronize` nem migration automática no startup.

## End-to-End with Docker Compose

Os E2E não dependem de PostgreSQL instalado no host. O contrato completo está em
[e2e-compose.md](./contracts/e2e-compose.md), e a implementação deve criar `compose.e2e.yaml` na
raiz do projeto.

Run the complete lifecycle:

```bash
npm run test:e2e
```

O script desse comando deve, sem intervenção manual:

1. gerar um project name exclusivo;
2. validar `compose.e2e.yaml` com `docker compose config -q`;
3. subir PostgreSQL com `up -d --wait`;
4. descobrir a porta dinâmica publicada em `127.0.0.1`;
5. montar `DATABASE_URL` somente para o processo de teste;
6. executar todas as migrations desde um banco vazio;
7. confirmar que não há migration pendente;
8. executar Vitest E2E com `PERSISTENCE_ENABLED=true`;
9. coletar estado e logs sanitizados em caso de falha;
10. executar `down -v --remove-orphans` mesmo quando migration ou teste falhar.

Expected outcome:

- o healthcheck `pg_isready` está saudável antes das migrations;
- cada execução recebe container, network, volume e porta isolados;
- nenhuma porta fixa conflita com PostgreSQL local ou outro job de CI;
- os testes exercitam PostgreSQL real, constraints, transactions e migrations;
- o processo Nest continua sem listener HTTP;
- nenhum container, network ou volume do projeto E2E permanece após o comando;
- o exit code representa corretamente falha de setup, migration, teste ou teardown.

Para diagnóstico manual, use o mesmo project name calculado pelo script:

```bash
docker compose -f compose.e2e.yaml -p "$E2E_PROJECT_NAME" ps --all
docker compose -f compose.e2e.yaml -p "$E2E_PROJECT_NAME" logs --no-color --timestamps
```

Os E2E usam fixtures/adapters determinísticos para Mercado Livre e evidência afiliada. Credenciais
OAuth reais e chamadas live continuam proibidas nessa suíte.

## Start the Resident Scheduler

Configure:

```dotenv
EXECUTION_MODE=scheduled
SCHEDULE_CRON=<valid-cron-expression>
SCHEDULE_TIMEZONE=<valid-IANA-timezone>
```

Run:

```bash
npm run start:scheduler
```

Expected outcome:

- após o purge inicial de retenção terminar, um cron de pesquisa é registrado; com persistência
  ativa, também é registrado o cron técnico horário de manutenção;
- o processo permanece aberto sem escutar HTTP;
- cada tick chama a mesma rotina completa;
- um tick ocorrido enquanto a rotina anterior está ativa é registrado como descartado/ignorado e
  não inicia uma segunda execução;
- `runOnInit=false`; ticks perdidos durante indisponibilidade não são recuperados e o processo
  aguarda a próxima ocorrência futura;
- no modo `once`, a limpeza inicial também termina antes da pesquisa. Se o purge inicial falhar, o
  bootstrap falha sem registrar cron nem pesquisar;
- purge de retenção roda pelo menos de hora em hora em UTC; falha horária gera log sanitizado e nova
  tentativa na próxima hora;
- executar exatamente uma réplica por ambiente (não há lock distribuído);
- falhas/incompletudes são reportadas somente por logs JSON sanitizados; o serviço não envia alertas
  externos;
- `SIGTERM` encerra scheduler, chamadas em andamento e pool de forma ordenada.

Execute este release com exatamente uma réplica.

## Automated Validation Suites

```bash
npm run test:contract
npm run test:integration
npm run test:e2e
npm run migration:run
npm run migration:status
npm run test:performance
```

Required scenarios:

1. **Category configuration**: lista ausente, vazia, duplicada, com 11 IDs, categoria inexistente,
   pai ou de outro site é rejeitada antes de consultar rankings; 1 e 10 folhas MLB válidas passam.
2. **Category completeness**: todas as referências de todas as categorias são consumidas;
   10 categorias com 20 cada processam 200, sem truncamento.
3. **Category outcomes**: resposta oficial sem ranking resulta em `PROCESSED_NO_RANKING`; timeout,
   resposta parcial ou contrato malformado resulta em `INCOMPLETE`, sem seleção.
4. **Duplicate membership**: o mesmo produto/variação em duas categorias gera uma avaliação e
   preserva duas posições de ranking.
5. **Leader tournament**: apenas o candidato qualificado mais bem posicionado de cada categoria
   participa; posições de categorias diferentes nunca são comparadas; desconto, comissão e
   `categoryId` resolvem a comparação entre líderes.
6. **Leader promotion**: mudança confirmada invalida o líder, promove candidato da mesma categoria
   e recalcula a comparação. Falha técnica de revalidação produz `INCOMPLETE`.
7. **Evidence freshness**: `59:59.999` é válido, `60:00.000` expira; `validUntil` posterior não
   estende uma hora; evidência que vence durante execução é reprovada antes da seleção.
8. **Missing affiliate evidence**: produto sem evidência é rejeitado e nunca gera pacote parcial.
9. **Bad link**: link cujo destino não corresponde ao produto/variação é rejeitado.
10. **Persistence off**: contexto inicia com banco indisponível e nenhuma inicialização de
   `DataSource` ocorre.
11. **Persistence on**: Compose entrega PostgreSQL vazio e saudável; migrations, constraints,
   transação final, rollback e reconciliação de execução interrompida são exercitados no banco real.
12. **Retention**: purge remove execução terminal exatamente no corte e além dele, em cascata com
   referências, avaliações, links e seleção; preserva execução não vencida e `RUNNING`; é idempotente.
   Provar purge concluído antes do cron e antes do modo `once`, falha do purge inicial bloqueando a
   pesquisa, e falha de ciclo horário registrada para nova tentativa.
13. **Idempotency**: duas conclusões concorrentes da mesma ocorrência deixam uma execução, uma
   avaliação por produto/variação e no máximo uma seleção.
14. **Scheduler configuration**: cron/timezone ausentes ou inválidos bloqueiam qualquer modo antes
   do registro do job ou execução da rotina; sobreposição local é descartada.
15. **Security**: logs e linhas persistidas não contêm client secret, refresh token, headers,
   cookies ou URL sensível não redigida.
16. **Performance**: o benchmark determinístico executa 100 amostras de sucesso para 10 categorias
   e 200 referências com latências simuladas fixas; ao menos 95 amostras terminam em até 600.000 ms.
   Também registra p50, p95, máximo, semente, perfil de latência e ambiente. Testes de borda/falha
   ficam fora da amostra de sucesso; não há chamadas live ao Meli.

## Optional Live Smoke Test

O smoke test live é opt-in, nunca roda no CI e usa somente operações públicas descritas em
[mercado-livre-gateway.md](./contracts/mercado-livre-gateway.md). Ele pode usar uma categoria e
poucos campos para validar o contrato, registrar apenas metadados sanitizados e respeitar rate limits.
Nenhum teste live abre
ou automatiza a Central de Afiliados.

## Acceptance Evidence

Ao concluir a validação, preserve:

- resultado dos testes e verificação de migrations;
- um `run-summary` sanitizado de cada modo de persistência;
- o pacote selecionado sanitizado ou a razão verificável de ausência;
- métricas de duração e contagem;
- prova de que nenhum listener HTTP foi aberto;
- prova de que o modo `PERSISTENCE_ENABLED=false` não inicializou PostgreSQL;
- identificação do project name E2E e prova de teardown sem container, network ou volume órfão;
- saída de sucesso de `check:pre-push`, `core.hooksPath` instalado e propagação de uma falha
  controlada pelo hook sem commit ou push real.

## README Documentation Validation

Use this section to verify the local and production procedures documented in the repository root
README. Detailed environment semantics remain in [environment.md](./contracts/environment.md),
manual evidence format in [affiliate-evidence.schema.json](./contracts/affiliate-evidence.schema.json),
and Docker test behavior in [e2e-compose.md](./contracts/e2e-compose.md).

### Local onboarding path

The README must present a complete, copyable sequence:

1. Install Node.js 24+ and npm, clone the repository, and run `npm ci`; explain that this installs
   the local Husky hook in development checkouts.
2. Copy `.env.example` to `.env`; replace every illustrative credential/value and configure the
   affiliate evidence file at an absolute path outside the repository. The application does not
   load `.env` itself: export the concrete values into the current shell/IDE before running any
   command (for Bash/Zsh, a fully populated shell-compatible `.env` may be exported with
   `set -a; source .env; set +a`).
3. Obtain affiliate eligibility, commission and sharing-link evidence manually using official
   Mercado Livre tools; never automate login or scrape the affiliate center.
4. Run `npm run config:check`, then `npm run start:once` to execute a single research routine.
5. Explain `npm run start:scheduler` for resident scheduling and identify the mandatory cron and
   IANA timezone settings.
6. Describe PostgreSQL as optional locally; when enabled, provision a separate database, set the
   toggle/connection settings, then run `npm run migration:run` and
   `npm run migration:status` before execution.

Expected result: the standalone process opens no HTTP listener, selects at most one product,
prints sanitized structured events, and does not persist history when the toggle is disabled.

### Production deployment path

The README must give an ordered, platform-neutral release checklist rather than claim a supported
hosting platform:

1. Provision a Node.js 24+ Linux process environment with outbound access to official Mercado Livre
   APIs and durable, restricted access to the manual evidence file.
2. Supply validated production policy, category IDs, schedule/timezone and OAuth credentials through
   the platform's secret/configuration facility; do not commit `.env` or secrets.
3. Decide explicitly whether PostgreSQL is enabled. If enabled, provision the production database,
   configure TLS as required, and run versioned migrations as a separate deployment/release step
   from an environment that has `tsx` available (it is currently a development dependency).
4. Install/build using repository scripts (`npm ci`, `npm run build`), verify migration status, and
   start the compiled process with `NODE_ENV=production`, `EXECUTION_MODE=scheduled` and the
   required runtime ENV.
5. Run exactly one active replica, configure process supervision/restart and graceful SIGTERM, and
   monitor structured sanitized logs. Do not recover missed scheduled occurrences.
6. State clearly that the repository has no application Dockerfile, production Compose/Helm
   manifest, deployment provider configuration or automated release workflow; the operator must
   supply those deployment-specific pieces.

Expected result: one long-lived scheduler instance executes only future occurrences; PostgreSQL
retention and startup purge apply only when persistence is enabled. Do not use the E2E Compose
project as production infrastructure.

### README acceptance checks

- Product scope and feature exclusions match FR-024/FR-025: no Telegram publishing, promotional
  copy/image generation, automated affiliate-center login or scraping is presented as implemented.
- Each command and path resolves to `package.json`, a repository script or an existing document.
- The README does not claim a license, hosting platform, application container image or CI deploy
  workflow that the repository does not define.
- Secret examples remain placeholders; explain 90-day retention and the single-replica constraint.
- All internal links resolve, commands are grouped by local run, migrations, quality checks and E2E.
- The quality section names `npm run check:pre-push`, lists its local scope and keeps E2E,
  performance and secret scanning as CI responsibilities.
