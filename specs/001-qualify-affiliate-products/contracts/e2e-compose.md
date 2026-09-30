# E2E Docker Compose Contract

`compose.e2e.yaml` é um arquivo autônomo, usado somente pelos testes end-to-end. Ele contém todas as
dependências externas reais do E2E. O primeiro release contém PostgreSQL; novos brokers, caches ou
serviços de infraestrutura devem ser adicionados ao mesmo contrato quando passarem a ser
necessários.

## Topology

```text
Vitest/Nest runner on host or CI
             |
             | DATABASE_URL with dynamic loopback port
             v
   postgres service in compose.e2e.yaml
```

- O runner da aplicação não é um serviço Compose neste release.
- O contexto Nest é standalone e não publica porta HTTP.
- Integrações Mercado Livre usam fixtures/adapters determinísticos; os E2E não usam rede live,
  OAuth real nem automação da Central.
- O arquivo de evidência afiliada usa fixture sanitizada montada/lida pelo runner.

## PostgreSQL Service

O serviço deve obedecer às seguintes regras:

- Nome lógico `postgres`; nenhum `container_name`.
- Imagem oficial PostgreSQL 18 fixada por patch, distribuição e digest. A baseline pesquisada é
  `postgres:18.6-trixie`; o digest deve ser verificado e atualizado deliberadamente no PR que criar
  o arquivo.
- Usuário e database exclusivos de E2E, nunca iguais aos de desenvolvimento ou produção.
- Senha sintética fornecida por `E2E_POSTGRES_PASSWORD`/Compose secret; nunca uma credencial real.
- Healthcheck com `pg_isready` usando o usuário e database do container.
- Porta interna `5432` publicada dinamicamente e somente em `127.0.0.1`.
- Volume nomeado project-scoped montado em `/var/lib/postgresql`, conforme o layout da imagem 18.
- Sem volume external, bind mount de dados, init scripts ou `tmpfs` obrigatório.
- Sem chave legada `version` no arquivo Compose.

`synchronize` e migrations automáticas permanecem desligados. O container fornece somente o banco;
o runner aplica todas as migrations versionadas desde zero.

## Per-Run Isolation

Cada execução gera `E2E_PROJECT_NAME` exclusivo e normalizado, por exemplo:

```text
affiliate-e2e-<ci-run-id>-<ci-job-id>
```

O script passa esse valor com `docker compose -p`. O project name isola container, network e
volume. A porta dinâmica evita colisão entre projetos que compartilham o mesmo daemon Docker.

## Required Lifecycle

O script `scripts/run-e2e.mjs` coordena, em ordem:

1. Verificar disponibilidade de Docker Engine e Compose v2.
2. Executar `docker compose -f compose.e2e.yaml -p <project> config -q`.
3. Executar `docker compose ... pull` para a imagem fixada.
4. Executar `docker compose ... up -d --wait --wait-timeout 60 postgres`.
5. Obter o endpoint com `docker compose ... port postgres 5432`.
6. Construir `DATABASE_URL` somente em memória e definir `PERSISTENCE_ENABLED=true`.
7. Executar migrations e exigir zero migrations pendentes.
8. Executar a suíte E2E contra o banco vazio e saudável.
9. Em falha, capturar `ps --all` e `logs --no-color --timestamps` antes da limpeza.
10. Sempre executar `docker compose ... down -v --remove-orphans` em bloco equivalente a `finally`.
11. Preservar o exit code de migrations/testes; falha no teardown também falha o comando.

O comando público `npm run test:e2e` deve encapsular esse ciclo completo. Um desenvolvedor ou CI
não precisa executar passos Docker manualmente no caminho normal.

## Test Environment

- `.env.e2e` real permanece ignorado pelo Git; `.env.e2e.example` pode documentar somente valores
  não sensíveis.
- `NODE_ENV=test`, `EXECUTION_MODE=once` e `PERSISTENCE_ENABLED=true` são obrigatórios.
- `DATABASE_URL` é calculada após a descoberta da porta, não fixada em arquivo.
- Client secret, refresh token, cookies e credenciais Mercado Livre reais são proibidos.
- Os testes devem provar também o caminho `PERSISTENCE_ENABLED=false`, usando URL inalcançável e
  verificando que nenhum `DataSource` é inicializado.

## Readiness and Failure Semantics

- O início dos testes depende do sucesso de `up --wait`; estado apenas `running` sem healthcheck
  saudável não basta.
- Timeout de readiness falha a suíte antes de migrations.
- Falha de migration impede os testes e é reportada separadamente.
- Recursos nunca permanecem para reutilização implícita entre execuções.
- Logs coletados devem ser sanitizados e não podem conter a senha de teste ou `DATABASE_URL`.

## CI Contract

O job de CI precisa de Docker Engine, Compose v2 e permissão para criar network, volume e container.
Execuções paralelas são suportadas por project name exclusivo e porta dinâmica. O job deve publicar
logs sanitizados como artifact apenas em falha e não pode cachear o volume PostgreSQL.

## Explicitly Unsupported

- PostgreSQL instalado diretamente no runner como dependência implícita;
- porta fixa `5432` ou `55432`;
- uso de Compose de desenvolvimento/produção;
- tags `latest` ou major sem digest;
- reutilização de banco/volume entre execuções;
- credenciais ou chamadas live do Mercado Livre;
- `/docker-entrypoint-initdb.d` como substituto das migrations;
- manter containers ativos após sucesso ou falha.
