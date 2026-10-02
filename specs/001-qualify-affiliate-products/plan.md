# Implementation Plan: Pesquisa e Seleção de Produtos Afiliados

**Branch**: `001-qualify-affiliate-products` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-qualify-affiliate-products/spec.md`

## Summary

Construir uma aplicação standalone em NestJS e TypeScript, sem servidor HTTP, que mantém um único
job de negócio agendado e uma manutenção técnica de retenção. Toda pesquisa, qualificação,
ordenação, revalidação e seleção fica em uma única rotina de aplicação. A rotina usa somente APIs
públicas documentadas do Mercado Livre para validar
entre 1 e 10 categorias folha MLB configuradas e obter seus rankings, produtos e preços. Ranking
oficial ausente conta como categoria processada sem candidatos; falha técnica ou resposta parcial
torna a execução incompleta. Como não existe contrato público para elegibilidade, comissão e geração
de link de afiliado, esses dados entram por arquivo de evidências preenchido manualmente nas
ferramentas oficiais. Evidência ausente, incompatível ou com mais de uma hora impede a seleção.

Em cada categoria, candidatos qualificados são ordenados por posição oficial e formam uma fila. O
primeiro candidato revalidado é o líder corrente. A seleção compara somente um líder revalidado por
categoria por desconto percentual decrescente, comissão esperada decrescente e identificador da
categoria crescente. Se uma mudança confirmada invalidar um líder, seu próximo candidato é
revalidado e a comparação entre líderes é refeita; falhas técnicas inconclusivas impedem qualquer
seleção.

O resultado e a auditoria podem ser persistidos em PostgreSQL. `PERSISTENCE_ENABLED=false` seleciona
um adaptador no-op e impede que módulo, driver ou pool de banco sejam inicializados; `true` exige
configuração válida, migrations aplicadas e gravação transacional. O processo roda em instância
única, evita sobreposição local e emite logs JSON estruturados em ambos os modos.

O projeto é um monólito modular com um bounded context inicial, `affiliate-research`. Domínio e
aplicação usam TypeScript puro e dependem de portas pequenas; NestJS, scheduler, APIs externas,
arquivo e ORM permanecem em adapters de infraestrutura. Os E2E executam o runner no host/CI e
sobem todas as dependências externas, inicialmente PostgreSQL, por `compose.e2e.yaml` dedicado.
Como trabalho documental complementar desta etapa, o README será ampliado para apresentar o
produto, esclarecer limites de escopo e guiar a execução local e a implantação genérica em
produção, sempre conforme comandos e restrições confirmados no repositório.

Como porta de qualidade local, o repositório também receberá Husky e um hook `pre-push` mínimo que
delega a um script versionado do `package.json`. O gate executa somente verificações determinísticas
e sem infraestrutura externa; E2E com Docker, benchmark completo e varredura de segredos continuam
sob responsabilidade da CI, que permanece a fonte final de integração.

## Technical Context

**Language/Version**: TypeScript 6.x em Node.js 24 LTS, módulos ESM

**Primary Dependencies**: NestJS 12.x (`@nestjs/core`, `@nestjs/config`), `cron`, TypeORM direto
(DataSource condicional), `pg`, Zod, dependency-cruiser e cliente HTTP nativo do Node.js; nenhum
framework HTTP de entrada e nenhuma automação de navegador. Husky 9.1.7 é dependência exclusiva de
desenvolvimento para instalar o hook Git versionado

**Storage**: PostgreSQL 18 quando `PERSISTENCE_ENABLED=true`; adaptador no-op sem conexão ou retenção
quando `false`

**Testing**: Vitest, `@nestjs/testing`, dependency-cruiser, Testcontainers para integrações
isoladas, Docker Compose para dependências E2E e fixtures sanitizadas dos contratos externos; o
`pre-push` roda lint, formato, tipos, arquitetura, testes isolados e build sem rede ou Docker

**Target Platform**: Processo Linux/container de longa duração, uma réplica por implantação

**Project Type**: Monólito modular standalone e agendado; não expõe portas, controllers ou
endpoints HTTP

**Performance Goals**: Concluir pelo menos 95% das execuções de 1 a 10 categorias, com até 200
referências oficiais no total, em até 10 minutos, medido em benchmark reproduzível com fixtures,
latências externas simuladas e 100 execuções por perfil; produzir no máximo uma seleção por
ocorrência agendada

**Constraints**: Uma rotina e um gatilho cron; sem sobreposição; sem scraping da Central; timeouts,
retry limitado e backoff para chamadas externas; credenciais somente por secret/ENV; falhar fechado
com dados incompletos; dependências arquiteturais sempre apontam para o domínio; E2E com
dependências externas em Docker Compose; `DATABASE_URL` obrigatória somente quando a persistência
está ligada; hook POSIX sem correção automática de arquivos e sem substituir os gates da CI

**Scale/Scope**: Um bounded context, um perfil de afiliado, site MLB, de 1 a 10 categorias folha
configuradas, no máximo 20 referências oficiais por categoria (200 por execução), uma política de
qualificação ativa, zero ou um produto selecionado, retenção PostgreSQL por 90 dias após o término
da execução e exatamente uma réplica ativa por ambiente

**Documentation Scope**: README.md em português do Brasil; conteúdo operacional baseado em
`.env.example`, `package.json`, scripts, configuração e contratos versionados. Não há plataforma
de deploy, imagem de aplicação, licença ou infraestrutura de produção declarada pelo repositório;
instruções de produção devem ser uma sequência genérica de implantação de processo Node.js e não
um comando específico de provedor.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Constitutional rule | Status | Design evidence |
|---|---|---|
| Qualificação baseada em evidências | PASS | Critérios tipados, snapshot da política, motivos por oferta e rejeição fechada para dados ausentes. |
| Conteúdo fiel e rastreável | PASS | Preços vêm da API oficial; comissão e link exigem evidência afiliada fresca e identificada. |
| Segurança e menor privilégio | PASS | OAuth/segredos fora do repositório, configuração validada e redaction de logs. |
| Idempotência e tolerância a falhas | PASS | Chave por ocorrência; respostas oficiais sem ranking são distintas de falhas técnicas; seleção determinística e job sem sobreposição. |
| Observabilidade sem exposição | PASS | Eventos JSON correlacionados, resumo terminal e URLs/segredos sensíveis fora dos logs. |
| Integrações oficiais e substituíveis | PASS | APIs públicas atrás de porta; scraping proibido; evidência manual pode ser trocada por gateway autorizado. |
| Separação das regras de negócio | PASS | Domínio e orquestrador não dependem de scheduler, HTTP, arquivo ou ORM. |
| Testes e portas de qualidade | PASS | Testes unitários, arquitetura, contrato, integração, configuração, migrations e E2E com dependências reais em Compose; o `pre-push` antecipa os gates locais determinísticos. |
| Documentação operacional verdadeira | PASS | O README distinguirá capacidades presentes, limites, execuções local/produção, armazenamento opcional e ausência de publicação Telegram; instruções serão rastreadas a arquivos e scripts existentes. |

**Research constraint**: a automação desassistida da Central não passa pelo gate de conformidade,
pois não há API pública documentada e os termos oficiais proíbem scraping. A entrega inicial usa
evidência manual validada. Uma integração automática de comissão/link somente pode substituir esse
adaptador após autorização formal ou publicação de um contrato oficial pelo Mercado Livre.

### Post-Design Gate

**Status: PASS**. O modelo, os contratos e o quickstart preservam todos os gates. Cobertura por
categoria distingue ranking processado, ausência oficial de ranking e falha técnica; a execução só
é selecionável quando todas as categorias configuradas foram processadas. Regras estáticas
impedem dependências invertidas ou imports profundos entre módulos, e os E2E partem de PostgreSQL
limpo e saudável no Compose. Com persistência ativa, manutenção remove execuções terminais e todos
os dados associados ao atingir 90 dias: purge síncrono no startup antes de qualquer pesquisa e
manutenção horária UTC enquanto residente. Sem persistência, nenhum histórico é retido.
Falhas/incompletudes geram somente logs estruturados sanitizados, sem canal externo de alerta. A
operação continua responsável por manter exatamente uma réplica e monitorar disponibilidade do
processo. O README ampliado não introduz promessas de publicação, deploy automatizado ou execução
em múltiplas réplicas; segredos continuam excluídos e cada comando documentado deverá existir no
manifesto ou script correspondente.

O contrato de `pre-push` não muda o modelo de domínio nem relaxa a CI: falha em qualquer comando
local bloqueia o push, enquanto E2E, benchmark e secret scan permanecem obrigatórios no workflow.

## Project Structure

### Documentation (this feature)

```text
specs/001-qualify-affiliate-products/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── README.md
│   ├── affiliate-evidence.schema.json
│   ├── e2e-compose.md
│   ├── environment.md
│   ├── mercado-livre-gateway.md
│   ├── pre-push.md
│   ├── run-summary.schema.json
│   └── selected-product.schema.json
└── tasks.md
```

### Source Code (repository root)

```text
README.md
.env.example
compose.e2e.yaml
.dependency-cruiser.cjs
package.json
package-lock.json
.husky/
├── install.mjs
└── pre-push
scripts/
└── run-e2e.mjs

src/
├── main.ts
├── app.module.ts
├── modules/
│   └── affiliate-research/
│       ├── affiliate-research.module.ts
│       ├── domain/
│       │   ├── entities/
│       │   ├── policies/
│       │   ├── services/
│       │   └── value-objects/
│       ├── application/
│       │   ├── ports/
│       │   │   ├── in/
│       │   │   └── out/
│       │   └── use-cases/
│       │       └── run-affiliate-research.use-case.ts
│       └── infrastructure/
│           ├── affiliate-evidence/
│           ├── mercado-livre/
│           ├── persistence/
│           │   ├── noop/
│           │   └── postgres/
│           │       ├── entities/
│           │       ├── migrations/
│           │       ├── mappers/
│           │       └── repositories/
│           └── scheduler/
│               ├── affiliate-research.job.ts
│               └── retention-maintenance.job.ts
└── platform/
    ├── config/
    ├── database/
    └── observability/

test/
├── architecture/
├── contract/
├── e2e/
├── fixtures/
├── integration/
└── unit/
```

**Structure Decision**: um pacote, processo, deploy e banco formam o monólito modular. O bounded
context `affiliate-research` é dono de linguagem, agregados, use case, adapters e tabelas desta
feature. O job é somente um driving adapter; `RunAffiliateResearch` é o único orquestrador e executa
sequencialmente descoberta, normalização, pré-qualificação, associação da evidência, ordenação,
revalidação, seleção, persistência opcional e observabilidade. Pastas internas não são jobs,
microserviços ou bounded contexts separados.

## README Documentation Design

O README atual já contém uma descrição curta, arquitetura, configuração básica, execução e testes,
mas não oferece onboarding completo nem uma sequência de implantação de produção. A mudança
planejada reorganiza e amplia o documento sem mudar código, contratos de runtime ou comportamento.

Estrutura proposta, em português do Brasil e com sumário navegável:

1. Visão geral do produto e do problema que resolve.
2. Funcionalidades implementadas e limites explícitos: seleção de zero ou um produto; evidência
   afiliada manual; nenhum scraping/login automático, geração promocional ou publicação no Telegram.
3. Fluxo da rotina e arquitetura do monólito modular, DDD e SOLID, incluindo persistência opcional.
4. Stack, requisitos e visão curta da estrutura do repositório.
5. Execução local passo a passo: Node/npm, `npm ci`, cópia/preenchimento de `.env`, carregar os
   valores no ambiente da shell (a aplicação não lê `.env` automaticamente), evidência manual no
   formato contratado, `config:check`, `start:once` e `start:scheduler`.
6. Modos com e sem PostgreSQL, comandos verificados de migration e aviso de que `compose.e2e.yaml`
   é isolado para E2E, não uma composição de desenvolvimento ou produção.
7. Implantação genérica em produção: Node.js 24+, provisionamento externo opcional de PostgreSQL,
   gestão de segredos e arquivo de evidência, saída compilada, migrations como etapa anterior ao
   start executadas em um ambiente de release com `tsx`, `npm start`, exatamente uma réplica,
   reinício/supervisão e sinais de shutdown.
8. Testes e qualidade com comandos do `package.json`, instalação automática do hook local por
   `npm ci`, escopo do `pre-push`, expectativa de Docker para E2E e links à especificação,
   quickstart, contratos de ambiente e Compose.

Não adicionar badge, licença, provedor, Dockerfile, workflow de release, cron de plataforma ou
comando de deploy não suportados pelo repositório. A seção de produção deve nomear as decisões que
cabem ao operador (host/container e supervisor), e não apresentar exemplos de plataforma como
configuração oficial do projeto. Referências detalhadas de variáveis e validação ficam nos
documentos existentes em `specs/001-qualify-affiliate-products/`.

**Model / contracts impact**: nenhum agregado, tabela, variável, interface ou contrato externo de
runtime é introduzido. `contracts/pre-push.md` documenta apenas a interface de desenvolvimento
local; `data-model.md` registra explicitamente a ausência de impacto de dados. `quickstart.md`
complementa este plano com critérios verificáveis dos passos documentados.

## Pre-push Quality Gate Design

- Adicionar Husky `9.1.7` como `devDependency`, preservando npm e atualizando `package-lock.json`.
- Adicionar `prepare` apontando para `.husky/install.mjs`. O instalador não ativa hooks em CI nem
  quando `NODE_ENV=production`; nos demais ambientes chama a API moderna do Husky e não usa o
  cabeçalho legado `husky.sh`.
- Criar `check:pre-push` no `package.json` com, nesta ordem: `lint`, `format:check`, `typecheck`,
  `test:architecture`, `test:unit`, `test:contract`, `test:integration` e `build`. A composição deve
  parar no primeiro erro e poder ser executada diretamente fora do Git.
- Manter `.husky/pre-push` POSIX e com uma única responsabilidade: executar
  `npm run check:pre-push`, propagando o exit code. O hook não altera arquivos e não adiciona
  bypass automático.
- Não incluir `test:e2e`, `test:performance`, chamadas live ou secret scan no hook. O workflow de CI
  continua executando a suíte completa, PostgreSQL via Compose e Gitleaks; `--no-verify` permanece
  um escape explícito do Git, nunca parte dos scripts do projeto.
- Validar instalação por `npm ci`, `git config --get core.hooksPath`, execução direta do script e do
  hook e um caminho de falha com um stub temporário de `npm`, sem commit ou push real.

## Modular Monolith, DDD and SOLID Boundaries

- `AppModule` é o composition root e registra configuração, o job `cron` e infraestrutura técnica
  condicional em conjunto com `AffiliateResearchModule`. Um coordenador de inicialização aguarda o
  purge antes de ativar os CronJobs; não depende da ordem de hooks entre providers diferentes. O
  grafo de módulos deve permanecer acíclico; `forwardRef()`
  não é aceito para contornar ciclo arquitetural.
- `AffiliateResearchModule` encapsula todos os providers e exporta somente o input port da rotina e
  o contrato de resultado. Futuros módulos acessam essa API pública, nunca entidades, repositories,
  mappers ou caminhos internos.
- `domain/` contém entidades, value objects, policies e invariantes em TypeScript puro. Imports de
  Nest, TypeORM, scheduler, configuração, HTTP e DTOs externos são proibidos.
- `application/` contém o único use case, commands/results e portas orientadas às necessidades da
  rotina. Não importa Nest ou infraestrutura e não contém regra que pertença ao domínio.
- `infrastructure/` implementa os driving/driven adapters: cron, Mercado Livre, evidência afiliada,
  PostgreSQL e no-op. Records ORM e mappers permanecem separados dos agregados de domínio.
- Tokens `Symbol` e factory/custom providers fazem a composição por interfaces. As portas seguem
  Interface Segregation e Dependency Inversion; adapters equivalentes passam pela mesma suíte de
  contrato, preservando Liskov Substitution.
- Não existe repository genérico, service locator, event bus, CQRS, fila ou módulo por etapa. Esses
  mecanismos só podem ser adicionados diante de uma necessidade de negócio ou operação comprovada.
- Não há Shared Kernel de domínio neste primeiro bounded context. `platform/` contém concerns
  técnicos e não pode ser importado pelo domínio.
- dependency-cruiser executa como `test:architecture` e falha em ciclos, imports não resolvidos,
  domínio/aplicação dependentes de infraestrutura, deep imports entre módulos ou acesso cruzado a
  internals. Um teste de `TestingModule` comprova wiring e exports mínimos do módulo.

## Runtime Flow

1. O processo carrega e valida ENV antes de criar recursos. Cron e timezone IANA são obrigatórios
   sem defaults em todos os ambientes e modos.
2. Se persistência estiver ligada, um purge de terminais vencidos é aguardado no bootstrap depois da
   reconciliação de execuções abandonadas. Falha nesse purge bloqueia o bootstrap e qualquer
   pesquisa. Só depois a aplicação ativa o cron de pesquisa (`runOnInit=false`) e um cron horário de
   manutenção UTC, ambos com prevenção local de sobreposição. Em `once`, o purge inicial também
   ocorre antes da execução única, sem registrar crons. Ticks de pesquisa concorrentes são
   descartados; ocorrências perdidas durante indisponibilidade não são enfileiradas, e o processo
   aguarda o próximo horário futuro.
3. O gatilho cria `executionKey` a partir do nome da rotina e do instante agendado em UTC.
4. A rotina consulta e valida cada uma das 1 a 10 categorias folha configuradas; “sem ranking” oficial
   é terminal e completo para aquela categoria.
5. As referências (até 20 por categoria) são resolvidas por tipo através de operações oficiais,
   normalizadas, deduplicadas por produto/variação e pré-qualificadas.
6. A rotina associa evidência afiliada manual fresca pelo par produto/variação; válida somente antes
   do menor entre `capturedAt + 1 hora` e `validUntil`.
7. Para cada categoria, candidatos qualificados entram em fila pela posição oficial ascendente.
8. O líder corrente de cada categoria é revalidado; mudança confirmada promove o próximo candidato
   daquela categoria e força nova comparação; falha técnica deixa a execução incompleta.
9. Líderes revalidados são ordenados por desconto percentual desc., comissão esperada desc. e
   `categoryId` asc.; posições de categorias diferentes nunca são comparadas.
10. A rotina retorna zero ou um `SelectedProduct` e grava o agregado se a persistência estiver ativa.
11. Um resumo terminal estruturado é emitido e o lock local é liberado em bloco `finally`. Logs de
    falha/incompletude não disparam notificações externas.

## Persistence Toggle Design

- `PERSISTENCE_ENABLED` aceita exclusivamente `true` ou `false` e assume `false` quando ausente.
- O módulo PostgreSQL é registrado condicionalmente. No modo desligado, `TypeOrmModule`,
  `DataSource` e pool não existem no grafo de dependências.
- Uma única porta `ResearchExecutionStore` representa persistência e retenção. O adaptador PostgreSQL
  implementa `begin`, `complete`, `fail`, `markInterrupted` e `purgeExpired(cutoff)`; o adaptador
  no-op retorna explicitamente `persistence-disabled` e não retém dados.
- `PERSISTENCE_ENABLED=true` sem `DATABASE_URL`, schema válido ou migrations aplicadas falha antes
  do scheduler iniciar. Não existe fallback silencioso para no-op.
- Chamadas remotas não mantêm transação aberta. A execução é iniciada em transação curta e o
  resultado completo é persistido atomicamente em outra; execuções `RUNNING` antigas são
  reconciliadas para `INTERRUPTED` no próximo bootstrap.
- Um adapter de retenção reconcilia `RUNNING` abandonadas para `INTERRUPTED`, depois executa e
  aguarda o purge inicial antes de permitir modo `once` ou registrar qualquer cron. O purge remove
  em uma transação apenas execuções terminais com `finished_at <= cutoff` (`cutoff` é o instante da
  chamada menos 90 dias); cascades removem referências, avaliações, links afiliados e seleção.
  Qualquer falha no purge inicial aborta o bootstrap. Enquanto residente, um cron UTC `0 * * * *`
  tenta a manutenção pelo menos a cada hora, sem se sobrepor; falhas horárias geram log estruturado e
  serão tentadas novamente na próxima hora, sem interromper pesquisa ativa. Uma indisponibilidade
  posterga o purge, que volta a ser obrigatório no próximo startup antes de pesquisar.
- `synchronize` e migrations automáticas permanecem desligados. Migrations versionadas são etapa
  operacional separada.

## Retention and Scheduler Operations

- `research_execution.finished_at` indexado é o relógio de retenção; toda transição para estado
  terminal define esse timestamp, inclusive `FAILED`, `INCOMPLETE` e `INTERRUPTED`. Registros sem
  término e linhas `RUNNING` permanecem protegidos.
- `ON DELETE CASCADE` no agregado de execução mantém a remoção de auditoria, evidências e link
  afiliado atômica. A manutenção usa o mesmo `EntityManager` transacional e remove somente linhas
  terminais cujo `finished_at` cruzou o corte. Particionamento fica fora do escopo pelo volume
  projetado.
- A garantia de instância única é de implantação, não de coordenação distribuída no código. Mais
  de uma réplica pode produzir execuções duplicadas; isso não é suportado neste release.
- A aplicação emite eventos JSON para início, conclusão, falha/incompletude e falha de manutenção,
  com run/execution ID, status, duração, contagens e códigos estáveis. Nunca registra URL afiliada,
  credenciais nem mensagens cruas de exceção. Não implementa Telegram/email/integração de alerta
  operacional; supervisão de processo e alertas derivados dos logs pertencem à plataforma.

## Deterministic Performance Benchmark

- Benchmark isolado do `RunAffiliateResearchUseCase`, usando fixtures e fakes para gateways,
  resolução de produto, verificação de imagem, armazenamento e relógio. Não chama Meli nem a Central.
- Perfil de carga de sucesso cobre 10 categorias × 20 referências, revalidação do líder final,
  semente fixa e latências simuladas determinísticas por operação (50 ms para validação/ranking de
  categoria, 100 ms por resolução de item/produto, 50 ms para checagem de imagem e 100 ms para
  revalidação final), com concorrência limitada pelo mesmo `MELI_MAX_CONCURRENCY` configurado; perfil
  de borda cobre uma categoria e perfil de falha valida encerramento seguro sem compor a amostra de
  duração. O perfil bem-sucedido não injeta retries; um cenário de retry determinístico é separado.
- Executar 100 vezes cada perfil de sucesso e registrar p50, p95, máximo, workload, semente,
  latências e ambiente/runtime. Aceitar se ao menos 95/100 terminarem em até 600.000 ms e cada
  resultado tiver uma única seleção quando a fixture assim exigir. O resultado mede o pipeline
  sintético, não latência nem SLA de produção do Mercado Livre.

## E2E Infrastructure Design

- `compose.e2e.yaml` é autônomo e contém todas as dependências externas necessárias aos E2E;
  inicialmente apenas PostgreSQL. Não reutiliza Compose, volumes, banco ou credenciais de
  desenvolvimento/produção.
- O runner Vitest/Nest permanece no host ou runner de CI. Ele cria o application context
  standalone e usa uma porta PostgreSQL publicada dinamicamente em `127.0.0.1`, descoberta por
  `docker compose port`; nenhuma porta fixa ou `container_name` é permitida.
- Cada execução usa project name exclusivo, imagem PostgreSQL fixada por patch e digest, volume
  nomeado project-scoped e healthcheck com `pg_isready`.
- O script E2E valida o Compose, baixa a imagem, executa `up -d --wait`, descobre a porta, monta
  `DATABASE_URL`, aplica migrations desde banco vazio, verifica que não há migration pendente e só
  então executa os testes.
- Integrações Mercado Livre usam fixtures/adapters determinísticos nos E2E; credenciais live nunca
  entram no Compose. Smoke tests live continuam separados e opt-in.
- Em sucesso ou falha, o script executa `down -v --remove-orphans`. Em falha, coleta `ps` e logs
  antes do teardown, preserva o exit code original e também falha se a limpeza deixar recursos.
- Testcontainers pode permanecer apenas em testes de integração estreitos. O E2E deve passar pelo
  contrato Docker Compose descrito em `contracts/e2e-compose.md`.

## External Integration Decision

- A aplicação não expõe API, mas consome APIs oficiais de saída do Mercado Livre.
- Os IDs configurados são validados como categorias folha MLB antes do ranking.
- Cada categoria usa `/highlights/MLB/category/{categoryId}` e consome todas as referências oficiais
  devolvidas (até 20); dez categorias limitam naturalmente o escopo a 200 referências brutas.
- Somente a resposta oficial documentada de ausência de ranking para categoria folha validada conta
  como `PROCESSED_NO_RANKING`. Falhas técnicas, resposta parcial, erro de contrato ou falha de
  autenticação tornam a execução `INCOMPLETE` sem seleção.
- O ranking pode conter `ITEM`, `PRODUCT` e `USER_PRODUCT`; a infraestrutura resolve cada tipo por
  operação oficial compatível e nunca recorre a scraping. Avaliação por produto/variação é única,
  mas memberships e posições por categoria permanecem preservadas.
- Metadados e preço vigente/regular vêm das operações oficiais atuais de itens/produtos e preço.
- Comissão de vendedor nunca é tratada como comissão do afiliado.
- Elegibilidade, percentual e link entram pelo contrato `affiliate-evidence.schema.json`, produzido
  manualmente por ferramentas oficiais. Validade efetiva é o menor entre validade da fonte e
  `capturedAt + 1 hora`.
- Playwright, Selenium, endpoints internos, interceptação de tráfego e scraping da Central são
  explicitamente excluídos deste plano.
- Respostas `429` respeitam `Retry-After`; falhas transitórias recebem retry limitado com jitter e
  falhas de autenticação, contrato ou dados causam encerramento fechado da execução.

## Complexity Tracking

Nenhuma violação constitucional foi aceita. O adaptador manual de evidência é uma restrição de
conformidade e uma substituição temporária explícita, não um segundo fluxo de negócio.
