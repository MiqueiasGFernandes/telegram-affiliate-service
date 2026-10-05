# Environment Contract

Toda configuração é validada antes que qualquer recurso seja inicializado ou qualquer job seja
registrado. `SCHEDULE_CRON` e `SCHEDULE_TIMEZONE` são obrigatórios em todos os modos, inclusive
`once`, e não possuem defaults. Chaves desconhecidas podem existir no ambiente, mas somente as
declaradas aqui entram na configuração tipada. Booleanos aceitam exclusivamente `true` ou `false`.

## Runtime

| Variable | Required/default | Validation and meaning |
|---|---|---|
| `NODE_ENV` | Default `development` | `development`, `test` ou `production` |
| `EXECUTION_MODE` | Default `scheduled` | `scheduled` mantém o processo; `once` executa uma vez e fecha o contexto |
| `LOG_LEVEL` | Default `info` | Nível suportado pelo logger Nest |
| `SCHEDULE_CRON` | Required in every mode | Expressão cron válida; obrigatória mesmo em `once`, sem valor padrão |
| `SCHEDULE_TIMEZONE` | Required in every mode | Nome IANA válido, obrigatório sem valor padrão |
| `RUN_MAX_DURATION_MS` | Default `600000` | Inteiro entre 1.000 e 600.000 |

O release inicial suporta exatamente uma réplica por ambiente; mais réplicas são não suportadas e
podem iniciar execuções duplicadas. O mutex local evita sobreposição somente dentro do processo.
Não há backlog: ocorrências perdidas durante indisponibilidade não são recuperadas; o scheduler
aguarda o próximo horário futuro. O cron de pesquisa não executa no startup. Com persistência
habilitada, o purge de retenção deve concluir no startup antes de ativar qualquer modo de execução;
purge inicial malsucedido impede o início do serviço. Enquanto residente, a manutenção repete pelo
menos a cada hora em UTC; falhas são logadas e tentadas na próxima hora. Falhas e incompletudes
emitem somente logs estruturados sanitizados, sem transporte externo de alertas.

## Persistence Toggle

| Variable | Required/default | Validation and meaning |
|---|---|---|
| `PERSISTENCE_ENABLED` | Default `false` | Quando `false`, nenhum módulo/driver/pool PostgreSQL é criado |
| `DATABASE_URL` | Required only when enabled | URL PostgreSQL válida; tratada como segredo e nunca registrada |
| `DATABASE_SSL` | Default `false` | Habilita TLS conforme política do ambiente |
| `DATABASE_POOL_MAX` | Default `5` | Inteiro entre 1 e 20; ignorado quando disabled |

Regras condicionais:

- `PERSISTENCE_ENABLED=true` sem `DATABASE_URL` falha no bootstrap.
- `PERSISTENCE_ENABLED=false` ignora variáveis de banco e resolve o store no-op.
- Falha de conexão com persistência habilitada nunca faz fallback para no-op.
- Migrations não são executadas automaticamente pelo scheduler.

## Qualification Policy

| Variable | Required/default | Validation and meaning |
|---|---|---|
| `AFFILIATE_CURRENCY` | Default `BRL` | Código ISO 4217 em maiúsculas |
| `LOW_TICKET_MIN` | Required | Decimal monetário não negativo |
| `LOW_TICKET_MAX` | Required | Maior ou igual a `LOW_TICKET_MIN` |
| `MEDIUM_TICKET_MIN` | Required | Estritamente maior que `LOW_TICKET_MAX` |
| `MEDIUM_TICKET_MAX` | Required | Maior ou igual a `MEDIUM_TICKET_MIN` |
| `MIN_DISCOUNT_PERCENT` | Required | Decimal maior que zero e menor ou igual a 100 |
| Categorias pesquisadas | Sem ENV | Obtidas da árvore oficial MLB em cada execução; até 10 folhas com maior volume, desempate por ID ascendente |

Decimais usam ponto no ambiente, independentemente do locale do host.

## Mercado Livre OAuth and Outbound Access

| Variable | Required/default | Validation and meaning |
|---|---|---|
| `MELI_SITE_ID` | Default `MLB` | Este plano aceita somente `MLB` |
| `MELI_CLIENT_ID` | Required | Segredo/identificador fornecido ao aplicativo autorizado |
| `MELI_CLIENT_SECRET` | Required | Segredo; nunca aparece em logs ou banco |
| `MELI_REFRESH_TOKEN` | Required | Segredo rotativo; nunca aparece em logs ou banco |
| `MELI_HTTP_TIMEOUT_MS` | Default `10000` | Inteiro entre 1.000 e 30.000 |
| `MELI_MAX_CONCURRENCY` | Default `4` | Inteiro entre 1 e 10 |
| `MELI_MAX_RETRIES` | Default `3` | Inteiro entre 0 e 5; apenas falhas transitórias |

O processo respeita `Retry-After` em `429`. Tokens atualizados devem retornar ao mecanismo de
segredos do ambiente; não são persistidos nas tabelas de negócio.

## Affiliate Evidence

| Variable | Required/default | Validation and meaning |
|---|---|---|
| `AFFILIATE_EVIDENCE_MODE` | Default `manual-file` | Primeiro release aceita somente `manual-file` |
| `AFFILIATE_EVIDENCE_FILE` | Required in manual-file mode | Caminho absoluto, legível e fora do repositório |

O primeiro release implementa somente `manual-file`. Uma integração automática só pode ser
adicionada após existir autorização formal e adapter específico aprovado. O bootstrap falha se o
modo selecionado não possuir provider registrado.

## Logging Prohibitions

Nenhuma variável marcada como segredo, header de autorização, refresh token, payload OAuth ou URL
com parâmetros potencialmente sensíveis pode ser registrada. O link afiliado é substituído por
produto, variação, host e fingerprint em eventos estruturados.

Eventos operacionais de início, conclusão, falha/incompletude e falha de manutenção incluem IDs de
correlação, status, duração, contagens e código de erro estável. Mensagens cruas de exceções externas,
credenciais e URLs afiliadas não são permitidas. Exportação de métricas, supervisão do processo e
alertas derivados de logs pertencem à plataforma de implantação e não são integrados pelo serviço.
