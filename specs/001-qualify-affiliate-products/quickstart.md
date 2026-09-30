# Quickstart Validation Guide

Este guia descreve como validar a implementação planejada de ponta a ponta. Os comandos passam a
existir durante a fase de implementação; este documento não contém código da aplicação.

## Prerequisites

- Node.js 24 LTS e npm compatível.
- Credenciais OAuth de uma aplicação Mercado Livre autorizada para as operações públicas usadas.
- Categorias MLB válidas para a pesquisa.
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

Expected outcome: o validador aceita somente entradas completas, HTTPS, vigentes e com fingerprint
válido. A validação semântica da rotina ainda confirma produto/variação, intervalo percentual,
datas e reconciliação monetária.

## Run Once Without Persistence

Configure o ambiente conforme [environment.md](./contracts/environment.md). Exemplo deliberadamente
sem valores comerciais ou segredos reais:

```dotenv
NODE_ENV=development
EXECUTION_MODE=once
PERSISTENCE_ENABLED=false
AFFILIATE_CURRENCY=BRL
LOW_TICKET_MIN=<decimal>
LOW_TICKET_MAX=<decimal>
MEDIUM_TICKET_MIN=<decimal>
MEDIUM_TICKET_MAX=<decimal>
MIN_DISCOUNT_PERCENT=<decimal>
MELI_CATEGORY_IDS=<comma-separated-category-ids>
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
- exatamente uma execução pesquisa, qualifica, ordena e revalida;
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
SCHEDULE_TIMEZONE=America/Sao_Paulo
```

Run:

```bash
npm run start:scheduler
```

Expected outcome:

- um único job nomeado é registrado;
- o processo permanece aberto sem escutar HTTP;
- cada tick chama a mesma rotina completa;
- um tick ocorrido enquanto a rotina anterior está ativa é registrado como descartado/ignorado e
  não inicia uma segunda execução;
- `SIGTERM` encerra scheduler, chamadas em andamento e pool de forma ordenada.

Execute este release com exatamente uma réplica.

## Automated Validation Suites

```bash
npm run test:contract
npm run test:integration
npm run test:e2e
npm run migration:test
```

Required scenarios:

1. **Qualification fixture**: ao menos 50 ofertas conhecidas produzem decisões e motivos esperados.
2. **Ranking and ties**: rank, desconto, comissão e ordem de origem resolvem empates na ordem
   especificada.
3. **Missing affiliate evidence**: produto sem evidência ou com evidência expirada é rejeitado e
   nunca gera pacote parcial.
4. **Price drift**: mudança entre coleta e revalidação rejeita o líder e tenta o próximo candidato.
5. **Bad link**: link cujo destino não corresponde ao produto/variação é rejeitado.
6. **Partial external response**: lote/página incompleto encerra sem seleção.
7. **Persistence off**: contexto inicia com banco indisponível e nenhuma inicialização de
   `DataSource` ocorre.
8. **Persistence on**: Compose entrega PostgreSQL vazio e saudável; migrations, constraints,
   transação final, rollback e reconciliação de execução interrompida são exercitados no banco real.
9. **Idempotency**: duas conclusões concorrentes da mesma ocorrência deixam uma execução, uma
   avaliação por produto/variação e no máximo uma seleção.
10. **Scheduler overlap**: uma Promise pendente prova que o segundo tick local não executa a rotina.
11. **Security**: logs e linhas persistidas não contêm client secret, refresh token, headers,
    cookies ou URL sensível não redigida.
12. **Performance**: pelo menos 95% das execuções de referência com 200 ofertas terminam em até 10
    minutos.

## Optional Live Smoke Test

O smoke test live é opt-in, nunca roda no CI e usa somente operações públicas descritas em
[mercado-livre-gateway.md](./contracts/mercado-livre-gateway.md). Ele deve limitar a uma categoria e
poucos itens, registrar apenas metadados sanitizados e respeitar rate limits. Nenhum teste live abre
ou automatiza a Central de Afiliados.

## Acceptance Evidence

Ao concluir a validação, preserve:

- resultado dos testes e verificação de migrations;
- um `run-summary` sanitizado de cada modo de persistência;
- o pacote selecionado sanitizado ou a razão verificável de ausência;
- métricas de duração e contagem;
- prova de que nenhum listener HTTP foi aberto;
- prova de que o modo `PERSISTENCE_ENABLED=false` não inicializou PostgreSQL;
- identificação do project name E2E e prova de teardown sem container, network ou volume órfão.
