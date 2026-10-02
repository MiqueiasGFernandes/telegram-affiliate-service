# Quickstart: Validar DDL e Imagem de Deployment

Este guia valida os artefatos planejados em `database/schema.sql` e `Dockerfile`. Use um banco descartável para validar bootstrap; nunca aplique o DDL em banco com dados.

## Pré-requisitos

- Docker com BuildKit e cliente `psql`.
- PostgreSQL vazio na versão suportada pelo contrato do schema.
- Para iniciar o serviço de verdade: variáveis válidas descritas em `.env.example`, segredo OAuth fornecido pelo ambiente e arquivo de evidência manual acessível no caminho absoluto configurado em `AFFILIATE_EVIDENCE_FILE`. Em plataformas com arquivos secretos de runtime, forneça o JSON por esse mecanismo; no Render, um Secret File chamado `affiliate-evidence.json` fica em `/etc/secrets/affiliate-evidence.json`. Esse arquivo estático não requer disco persistente.
- Uma única instância agendada por ambiente.

## 1. Preparar e conferir o banco

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
npm run migration:status
```

Esperado: o SQL conclui em transação; as cinco tabelas de aplicação, constraints e índice de retenção estão presentes; `migration:status` não mostra migrations pendentes. Repetir o bootstrap em schema existente deve falhar claramente sem remover dados.

## 2. Construir a imagem

```bash
docker build --pull -t telegram-affiliate-service:local .
```

Esperado: build de produção termina com sucesso. A etapa final não contém compilador nem dependências de desenvolvimento.

Inspecione usuário e comando configurados:

```bash
docker image inspect telegram-affiliate-service:local \
  --format 'user={{.Config.User}} cmd={{json .Config.Cmd}} exposed={{json .Config.ExposedPorts}}'
```

Esperado: usuário não privilegiado (`node`), comando `node dist/main.js` e nenhuma porta exposta.

## 3. Iniciar o scheduler

Forneça as variáveis por um secret manager ou arquivo de ambiente protegido fora do repositório. Para execução local, monte somente a evidência manual requerida pelo contrato em seu caminho absoluto:

```bash
docker run --rm \
  --env-file "$RUNTIME_ENV_FILE" \
  --mount "type=bind,src=$AFFILIATE_EVIDENCE_PATH,dst=/run/affiliate/evidence.json,readonly" \
  telegram-affiliate-service:local
```

Em um serviço Docker no Render, adicione `affiliate-evidence.json` em **Environment → Secret Files**. A imagem já usa `/etc/secrets/affiliate-evidence.json` como padrão e o usuário `node` está no grupo 1000 para ler o arquivo. Não é necessário definir `AFFILIATE_EVIDENCE_FILE`, anexar um disco persistente nem incluir o JSON na imagem. Para outros caminhos, sobrescreva essa variável no ambiente.

Confirme nos logs JSON sanitizados que o contexto da aplicação inicializou, não há tentativa de criar schema automaticamente e o scheduler permanece residente. Com `PERSISTENCE_ENABLED=true`, banco e migrations devem estar prontos antes de iniciar. Envie SIGTERM pelo supervisor/container runtime e confirme encerramento controlado. Não rode duas réplicas simultaneamente.

## Referências

- Detalhes do schema: [contracts/database-schema.md](contracts/database-schema.md) e [data-model.md](data-model.md).
- Contrato da imagem: [contracts/container-image.md](contracts/container-image.md).
- Configuração completa: `.env.example` e `specs/001-qualify-affiliate-products/contracts/environment.md`.
