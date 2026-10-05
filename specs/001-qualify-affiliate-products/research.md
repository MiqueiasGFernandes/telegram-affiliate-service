# Phase 0 Research: Pesquisa e Seleção de Produtos Afiliados

**Date**: 2026-10-01

**Status**: Phase 0 concluída. As decisões abaixo foram verificadas em documentação oficial ou
primária e as clarificações da especificação estão resolvidas.

## Escopo de categorias e viabilidade

**Decision**: exigir de 1 a 10 IDs MLB únicos por ambiente. Antes de consultar rankings, validar por
interfaces oficiais que cada ID existe no site MLB e identifica uma categoria folha. Processar
todas as referências devolvidas por cada ranking, até 20 por categoria; o máximo de 200 é derivado,
nunca um limite configurável que trunca resultados.

**Rationale (atualizado em 2026-10-04)**: a árvore oficial completa é obtida em uma chamada de dump;
o serviço seleciona somente até dez folhas com maior volume de anúncios, desempata por ID e valida
essas folhas antes de pesquisar rankings. Assim não há necessidade de ENV com IDs e o volume de
rankings segue compatível com SC-005 e com a expiração de evidência de uma hora, sem scraping.

**Alternatives considered**: pesquisar rankings para todas as folhas da árvore pública foi rejeitado
por volume e incompatibilidade com a janela de evidência. Categorias inferidas do arquivo de evidências
foram rejeitadas porque omitem categorias selecionadas sem evidência para os produtos do snapshot.
Limite de ofertas menor que o resultado oficial foi rejeitado por causar truncamento silencioso.

## Runtime e baseline

**Decision**: usar Node.js 24 LTS, NestJS 12.x e TypeScript 6.x em ESM. Pacotes `@nestjs/*` devem
permanecer no mesmo major e versões exatas devem ser travadas no lockfile.

**Rationale**: Node 24 é uma linha LTS e atende aos requisitos atuais do NestJS 12. O starter e o
guia de migração oficiais adotam NestJS 12 e TypeScript 6.

**Alternatives considered**: Node 22 LTS continua compatível, mas é uma baseline anterior. Node 26
permanece Current nesta data e não é apropriado para produção. Node 20 já encerrou suporte.

**Sources**: [Node release schedule](https://nodejs.org/en/about/previous-releases),
[Nest migration guide](https://docs.nestjs.com/migration-guide),
[Nest TypeScript starter](https://github.com/nestjs/typescript-starter/blob/master/package.json).

## Processo standalone e scheduler único

**Decision**: validar `SCHEDULE_CRON` e `SCHEDULE_TIMEZONE` antes de criar o application context;
ambos são obrigatórios em todo ambiente e não possuem default, inclusive no modo `once`. Depois, iniciar com
`NestFactory.createApplicationContext(AppModule)`, nunca chamar `listen()`, e controlar `CronJob`
diretamente pelo adapter `cron` já usado pelo job residente. A ativação dos jobs ocorre somente
depois do purge inicial de retenção; modo `once` também aguarda esse purge. O cron de pesquisa usa
timezone IANA explícito, não executa no startup e possui mutex local; um segundo cron técnico roda
a manutenção horária em UTC. O processo habilitará shutdown hooks e fechará contexto, jobs e pool
em `SIGTERM`/`SIGINT`.

**Rationale**: application context é a forma oficial de executar Nest sem listeners de rede.
Validar antes do bootstrap impede registro ou execução acidental com periodicidade implícita;
timezone inválido também deve falhar fechado. O mutex descarta ticks locais enquanto a execução
anterior ainda está ativa. A manutenção técnica não adiciona etapa ao fluxo de negócio; pesquisa,
qualificação e seleção continuam sendo uma única rotina.

**Alternatives considered**: cron externo reduziria o tempo residente, mas exigiria outro mecanismo
operacional e não resolveria o purge antes do modo `once`; usar Nest `ScheduleModule` também seria
possível, mas a implementação atual possui adapter fino baseado em `cron`. Um job técnico horário de
retenção é aceito porque não separa o caso de uso de pesquisa.

**Sources**: [Standalone applications](https://docs.nestjs.com/standalone-applications),
[`cron` README](https://github.com/kelektiv/node-cron/blob/main/README.md),
[Nest lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events).

## Concorrência e idempotência

**Decision**: implantar uma única réplica. Combinar mutex em processo com uma `executionKey` estável
no formato `affiliate-research:<scheduled-for-UTC>`. Quando o banco estiver ligado, constraints
únicas protegem contra repetição da mesma ocorrência e da mesma oferta.

**Rationale**: a proteção do cron é local ao processo e não coordena réplicas. Como PostgreSQL é
opcional, ele não pode ser pré-requisito para o lock em todos os modos. Singleton é a garantia
coerente para o primeiro release.

**Alternatives considered**: lock distribuído do Nest com store compartilhado é a evolução correta
para múltiplas réplicas. Advisory locks foram rejeitados no primeiro release porque prendem sessão,
não oferecem lease/fencing e desaparecem quando a persistência está desligada.

**Sources**: [Nest reliability locks](https://docs.nestjs.com/reliability/locks),
[PostgreSQL explicit/advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html).

## Retenção de auditoria

**Decision**: definir retenção de 90 dias após o término da execução. `finished_at` é preenchido em
todo estado terminal e indexado. Um adapter PostgreSQL apaga em uma transação execuções terminais
com `finished_at <= cutoff`, onde `cutoff` é calculado uma vez como início da limpeza menos 90 dias;
relações usam `ON DELETE CASCADE` para remover auditoria, evidências e links afiliados em conjunto.
Reconcilia `RUNNING` abandonadas para `INTERRUPTED`, aguarda purge no startup e só então permite
pesquisa ou registra scheduler. Um CronJob UTC `0 * * * *` repete o purge pelo menos de hora em hora
no modo residente, sem sobrepor tentativas. Não expirar registros ainda `RUNNING`; a reconciliação
atribui `finished_at` atual. Sem persistência não existe histórico. Downtime posterga a limpeza até
o startup, antes de qualquer nova pesquisa.

**Rationale**: centralizar a expiração na raiz do agregado evita resíduos órfãos e particionamento
prematuro para o volume esperado. A limpeza horária limita a retenção excedente enquanto residente;
a limpeza síncrona no startup trata registros vencidos durante downtime. Se o purge inicial falhar,
bootstrap deve abortar para não pesquisar antes da limpeza exigida. Falhas horárias são logadas e
tentadas novamente na próxima hora.

**Alternatives considered**: excluir tabelas independentes foi rejeitado por risco de auditoria
parcial; particionamento fica adiado até volume demonstrar necessidade. Excluir somente durante
pesquisas foi rejeitado por deixar dados retidos além do limite quando a periodicidade de pesquisa é
baixa ou a aplicação não roda no modo residente.

**Sources**: [PostgreSQL partitioning and bulk-delete trade-offs](https://www.postgresql.org/docs/current/ddl-partitioning.html),
[TypeORM transactions](https://typeorm.io/docs/transactions/).

## Recuperação e monitoramento operacional

**Decision**: manter um job de negócio residente para a pesquisa e um CronJob de manutenção horária
UTC; configurar o job de pesquisa com `runOnInit=false`, timezone IANA explícito e proteção contra
sobreposição em processo. A inicialização aguarda o purge antes de registrar ambos os crons. O cron
de pesquisa não mantém backlog:
após downtime, esperar a próxima ocorrência futura. Ticks enquanto a rotina está ativa são
descartados, nunca enfileirados. A plataforma deve implantar uma réplica exata; nenhuma garantia
distribuída é oferecida. Falha/incompletude e falha de purge geram apenas logs JSON sanitizados, sem
Telegram, email ou outro canal de alerta operacional.

**Rationale**: o comportamento evita publicação retroativa e mantém a rotina única. Scheduler local
não coordena réplicas; essa restrição precisa ser imposta no deploy. A decisão de logs-only é
compatível com o escopo, deixando supervisão e alertas derivados à plataforma.

**Sources**: [Nest task scheduling](https://docs.nestjs.com/application/task-scheduling),
[`cron` README](https://github.com/kelektiv/node-cron/blob/main/README.md).

## Benchmark de desempenho

**Decision**: adicionar benchmark determinístico do caso de uso com 100 execuções por perfil de
sucesso, 10 categorias × 20 referências, final revalidation, seed e latências simuladas fixas. Fakes
substituem gateways, armazenamento e relógio; nunca há chamadas live. Registrar p50/p95/máximo,
workload, seed, tempos simulados e ambiente. O perfil de sucesso simula 50 ms por validação/ranking
de categoria, 100 ms por resolução de item/produto, 50 ms por checagem de imagem e 100 ms na
revalidação final, sob o limite configurado de concorrência; retries não entram nesse perfil e têm
um cenário separado. Aprovação: pelo menos 95/100 em até 600.000 ms. Perfis de borda e falha são
reportados separadamente.

**Rationale**: mensura a rotina sob carga reproduzível e mantém o CI independente de rede/rate limit.
O valor é uma meta do pipeline de teste, não uma estimativa da latência real do Meli.

**Alternatives considered**: smoke test live não é reproduzível e fixtures sem latência ignorariam
parte do custo de integração.

## Configuração e toggle de persistência

**Decision**: validar ENV no bootstrap com `@nestjs/config` e Zod. Usar booleano estrito
`PERSISTENCE_ENABLED`, default `false`. Quando desligado, o módulo PostgreSQL inteiro não é
registrado; quando ligado, `DATABASE_URL` é obrigatória e qualquer falha encerra o bootstrap.
A rotina recebe sempre a porta `ResearchExecutionStore`, implementada por PostgreSQL ou no-op.

**Rationale**: condicionar apenas o provider ainda permite inicializar `DataSource` e pool.
Condicionar o módulo garante que desligar armazenamento realmente elimina conexão e retenção. A
porta mantém regras de negócio livres de branches de infraestrutura.

**Alternatives considered**: importar TypeORM sempre e fornecer opções vazias foi rejeitado porque
pode tentar conexão. Persistência em memória foi reservada a testes; em produção daria falsa
impressão de retenção. Um parser truthy foi rejeitado por aceitar valores ambíguos.

**Sources**: [Nest configuration and ConditionalModule](https://docs.nestjs.com/techniques/configuration),
[Nest custom providers](https://docs.nestjs.com/fundamentals/custom-providers),
[TypeORM DataSource](https://typeorm.io/docs/data-source/data-source/).

## PostgreSQL e TypeORM

**Decision**: usar PostgreSQL 18, `@nestjs/typeorm`, TypeORM e `pg`. Manter `synchronize: false` e
`migrationsRun: false`; aplicar migrations versionadas por comando operacional. Persistir a
execução em três tabelas: `research_execution`, `evaluated_offer` e `selected_product`.

**Rationale**: TypeORM possui integração oficial madura com Nest e suporta PostgreSQL, migrations,
transações e constraints sem acoplar o domínio. O modelo relacional mínimo preserva auditoria sem
transformar todos os dados em JSON.

**Alternatives considered**: Prisma exigiria adaptação adicional ao Nest sem benefício suficiente
neste caso. `pg` direto ampliaria mapeamento e manutenção. `synchronize: true` foi rejeitado pelo
risco de mudanças destrutivas.

**Sources**: [Nest SQL/TypeORM](https://docs.nestjs.com/data/typeorm),
[TypeORM migrations](https://typeorm.io/docs/migrations/setup/),
[PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Dinheiro, percentuais e tempo

**Decision**: persistir valores monetários em `numeric(14,2)`, percentuais em `numeric(7,4)`, moeda
ISO separada e instantes em `timestamptz`. No domínio, usar value objects que preservam decimal como
string ou inteiro de menor unidade; nunca converter dinheiro para `number` binário.

**Rationale**: `numeric` é exato. O tipo PostgreSQL `money` depende de locale, e `pg` devolve tipos
sem parser como string. `timestamptz` normaliza instantes; o timezone civil pertence ao scheduler.

**Alternatives considered**: `float`, `double` e `money` foram rejeitados por arredondamento ou
dependência regional. Timestamp sem timezone foi rejeitado por tornar ocorrências agendadas
ambíguas.

**Sources**: [PostgreSQL numeric](https://www.postgresql.org/docs/current/datatype-numeric.html),
[PostgreSQL money](https://www.postgresql.org/docs/current/datatype-money.html),
[PostgreSQL date/time](https://www.postgresql.org/docs/current/datatype-datetime.html),
[node-postgres types](https://node-postgres.com/features/types).

## Fonte oficial para produtos e ranking

**Decision**: validar oficialmente os IDs folha MLB configurados e consultar
`/highlights/MLB/category/{categoryId}` para cada um. O recurso fornece até 20 posições
`BEST_SELLER` por categoria e não oferece ranking global comparável. A resposta oficial documentada
de ausência de ranking, somente após validar que o ID é uma categoria folha válida, resulta em
`PROCESSED_NO_RANKING`; falhas técnicas, payloads parciais/malformados e demais erros tornam a
categoria indisponível e a execução incompleta. Operações oficiais atuais resolvem metadados por
tipo da referência e preço vigente/regular. `/trends` pode ser sinal auxiliar, mas nunca substitui
vendas.

**Rationale**: essas fontes fornecem árvore, ranking, título, imagem e preço com contrato público.
A posição de `/highlights` é necessária porque quantidade vendida de anúncios alheios é restrita.
O endpoint documenta até 20 resultados e exige categoria folha; um `404` documentado por ausência
de ranking é tratado como categoria integralmente processada sem candidatos, enquanto timeout,
resposta parcial ou contrato inválido torna a categoria indisponível e toda a execução incompleta.
A API de custos do anúncio representa comissão do vendedor, não ganho do afiliado.

**Alternatives considered**: consultar categorias pai foi rejeitado porque o ranking documentado
exige categoria folha. `sold_quantity` de itens alheios e endpoints antigos em descontinuação foram
rejeitados. Scraping de páginas, endpoints internos e interceptação de tráfego foram rejeitados por
ausência de contrato e incompatibilidade com os termos.

**Sources**: [Mais vendidos](https://developers.mercadolivre.com.br/pt_br/mais-vendidos-no-mercado-livre),
[Categorias](https://developers.mercadolivre.com.br/pt_br/categorias-e-publicacoes),
[Dump de categorias](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/dump-de-categorias),
[Itens e buscas](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas),
[API de preços](https://developers.mercadolivre.com.br/pt_br/api-de-precos),
[Reputação de vendedores](https://developers.mercadolivre.com.br/reputacao-de-vendedores),
[Rate limit](https://developers.mercadolivre.com.br/pt_br/usuarios-e-aplicativos/rate-limit-erro-429).

## Seleção determinística entre categorias

**Decision**: ordenar candidatos qualificados separadamente em cada categoria pela posição oficial
ascendente. O primeiro candidato válido forma o líder corrente daquela categoria. Ordenar somente
os líderes correntes por percentual de desconto decrescente, valor esperado de comissão
decrescente e `categoryId` ascendente. Revalidar o vencedor provisório; se uma mudança confirmada
o invalidar, removê-lo, promover o próximo candidato da mesma categoria e recalcular a ordenação
entre líderes. Se a revalidação atualizar preço, desconto ou comissão sem invalidar o candidato,
atualizar seu snapshot e recalcular a ordenação antes de finalizar. Falha técnica inconclusiva torna
a execução incompleta e impede seleção.

**Rationale**: posições de categorias diferentes não medem a mesma população e não podem ser
comparadas. O torneio entre líderes usa somente critérios comerciais comparáveis e termina com um
desempate total, estável e auditável. A promoção após falha preserva a regra de que apenas um líder
por categoria participa em cada iteração e atende à revalidação sem relaxar critérios.

**Alternatives considered**: comparar diretamente posições de categorias diferentes e chamar o
resultado de campeão global foi rejeitado por produzir uma alegação sem evidência. Manter somente
o primeiro líder e desistir após sua falha foi rejeitado porque ignora candidatos ainda válidos.
Promover todos os classificados de uma categoria simultaneamente foi rejeitado porque quebraria o
funil de líderes definido na especificação.

## Elegibilidade, comissão e link de afiliado

**Decision**: não automatizar a Central de Afiliados. O primeiro release consome um arquivo
validado de evidências produzido manualmente pelas ferramentas oficiais. Cada evidência inclui
produto/variação, confirmação de elegibilidade, percentual, valor quando exibido, link oficial e
instante de coleta. A validade efetiva termina exatamente uma hora após `capturedAt`, sem variável
de ambiente e sem possibilidade de uma validade declarada ampliar esse limite. Uma porta
substituível permite adotar integração oficialmente autorizada no futuro sem alterar a rotina.

**Rationale**: não foi encontrada API pública documentada para elegibilidade específica,
percentual/valor de comissão, Ganhos Extras ou geração do link. As instruções oficiais direcionam o
usuário à Central, Barra ou Gerador, enquanto os Termos do Programa de Desenvolvedores proíbem
robôs, spiders e scraping para obter dados fora da API. Sem evidência fresca, a única conduta
compatível com a constituição é rejeitar o candidato.

**Alternatives considered**: Playwright/Selenium, endpoints privados e cálculo pela taxa do
vendedor foram rejeitados. Uma API privada/parceria pode ser usada somente após acesso formal e
contrato documentado. Validade configurável ou fornecida pelo operador foi rejeitada porque
permitiria exceder a janela de uma hora decidida na especificação.

**Sources**: [Termos do Programa de Desenvolvedores](https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes),
[Como gerar links](https://www.mercadolivre.com.br/l/comece-a-recomendar),
[Páginas não permitidas para links](https://www.mercadolivre.com.br/l/afiliados-paginas-nao-permitidas),
[Perguntas frequentes de afiliados](https://www.mercadolivre.com.br/l/primeiros-passos-perguntas-frequentes-para-afiliados),
[Ganhos por venda](https://www.mercadolivre.com.br/l/afiliados-ganhos-por-venda),
[Ganhos Extras](https://www.mercadolivre.com.br/l/afiliados-ganhos-extras).

## Autorização e resiliência da integração

**Decision**: usar OAuth 2.0 oficial, refresh token rotativo e secrets injetados. Limitar
concorrência, agrupar operações suportadas, definir timeout e aplicar retry exponencial com jitter
somente para falhas transitórias. Respeitar `Retry-After` em `429`. Autenticação inválida, mudança de
contrato ou dados incompletos encerram a execução sem seleção.

**Rationale**: o scheduler precisa acesso duradouro sem armazenar senha da conta e deve evitar
amplificar limites ou publicar decisões parciais.

**Alternatives considered**: cookies persistidos, senha/MFA automatizados e retry ilimitado foram
rejeitados por segurança, fragilidade e política.

**Sources**: [Autenticação e autorização](https://developers.mercadolivre.com.br/pt_br/mensagens-post-venda/autenticacao-e-autorizacao),
[Permissões funcionais](https://developers.mercadolivre.com.br/pt_br/variacoes/permissoes-funcionais).

## Transações e recuperação

**Decision**: iniciar a execução em transação curta, executar I/O externo sem transação aberta e
gravar avaliações e seleção em uma transação final. Todas as operações transacionais usam o entity
manager do callback. No bootstrap seguinte, execuções `RUNNING` antigas viram `INTERRUPTED`.

**Rationale**: transações longas atravessando rede degradam concorrência e recuperação. Constraints
únicas e upsert fornecem idempotência suficiente em `READ COMMITTED` para este agregado.

**Alternatives considered**: `SERIALIZABLE` foi rejeitado porque não existe invariante adicional
que compense retries de transação inteira. Uma única transação envolvendo chamadas externas foi
rejeitada.

**Sources**: [TypeORM transactions](https://typeorm.io/docs/transactions/),
[PostgreSQL INSERT ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html),
[TypeORM repository API](https://typeorm.io/docs/working-with-entity-manager/repository-api/).

## Observabilidade e testes

**Decision**: usar o logger JSON oficial do Nest com um evento por linha, correlação por `runId` e
campos estruturados. Testar domínio e orquestrador com portas falsas; configuração em matriz on/off;
scheduler com timers falsos; contratos com fixtures; PostgreSQL real via Testcontainers; contexto
standalone completo sem listener HTTP.

**Rationale**: logs estruturados cobrem o modo sem persistência e permitem provar cada resultado.
Testes separados validam regras sem rede e mantêm contratos externos e schema sob verificação.

**Alternatives considered**: Pino/Winston foram adiados até existir necessidade de transporte ou
throughput adicional. Testes somente com banco em memória foram rejeitados porque não exercitam
`numeric`, constraints, transactions ou migrations do PostgreSQL.

**Sources**: [Nest logger](https://docs.nestjs.com/application/logger),
[Nest testing](https://docs.nestjs.com/fundamentals/testing),
[Vitest timers](https://vitest.dev/guide/mocking/timers),
[Testcontainers PostgreSQL](https://node.testcontainers.org/modules/postgresql/).

## Monólito modular e bounded context

**Decision**: manter um único processo/deploy e um bounded context inicial,
`affiliate-research`. Descobrir, qualificar, ordenar, revalidar e selecionar são etapas do mesmo
modelo e do mesmo use case, não módulos de negócio separados. `AffiliateResearchModule` encapsula
providers e expõe somente o input port da rotina e o resultado.

**Rationale**: Nest encapsula providers e usa exports como API pública do módulo. DDD define
bounded context por linguagem, modelo e invariantes, não por cada passo procedural. O grafo
permanece simples, acíclico e pronto para receber futuros módulos somente quando houver um modelo
de negócio realmente distinto.

**Alternatives considered**: um Nest module por etapa foi rejeitado por criar limites falsos e
acoplamento de sequência. Uma aplicação plana não oferece fronteira verificável. Microserviços
foram rejeitados pelo custo distribuído sem necessidade de autonomia ou deploy separado.

**Sources**: [Nest modules](https://docs.nestjs.com/modules),
[Nest dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules),
[DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf).

## Camadas DDD, Ports and Adapters e SOLID

**Decision**: estruturar `affiliate-research` em `domain`, `application` e `infrastructure`.
Domínio e aplicação são TypeScript puro. O único use case depende de output ports pequenos para
catálogo, evidência, armazenamento, relógio e observabilidade; adapters Nest/HTTP/arquivo/ORM
implementam essas portas. A composição usa tokens `Symbol` e factory/custom providers.

**Rationale**: Dependency Inversion mantém regras apontando para dentro. Portas orientadas ao use
case atendem Interface Segregation; suites de contrato asseguram que PostgreSQL/no-op e o adapter
manual respeitem Liskov Substitution. Scheduler fino, policies de domínio e adapters
específicos preservam Single Responsibility e permitem extensão sem alterar o núcleo.

**Alternatives considered**: decorators Nest e TypeORM no domínio foram rejeitados. Repository
genérico foi rejeitado por vazar persistência e produzir interfaces amplas. CQRS/event bus/fila
foram rejeitados porque todas as etapas são obrigatórias e sequenciais na mesma rotina.

**Sources**: [Nest custom providers](https://docs.nestjs.com/fundamentals/custom-providers),
[Nest TypeORM](https://docs.nestjs.com/data/typeorm),
[Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture).

## Shared Kernel e propriedade de dados

**Decision**: não criar Shared Kernel de domínio enquanto existir apenas um bounded context.
Configuração, logging, DataSource e bootstrap ficam em `platform/`, não em `shared/`. O módulo
`affiliate-research` é dono exclusivo de suas tabelas, records, mappers, migrations e repositories,
mesmo usando uma instância e pool PostgreSQL compartilháveis pelo monólito.

**Rationale**: Shared Kernel cria interdependência íntima e deve permanecer mínimo. Propriedade
lógica por módulo evita que um futuro módulo atravesse invariantes por acesso direto ao banco.

**Alternatives considered**: pasta `shared/` genérica foi rejeitada por virar depósito de helpers.
Banco por módulo foi rejeitado no primeiro release por não agregar isolamento útil ao único
bounded context.

**Sources**: [DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf),
[Nest SQL/TypeORM](https://docs.nestjs.com/data/typeorm).

## Enforcement of Architecture Boundaries

**Decision**: usar dependency-cruiser como gate `test:architecture`, com severidade de erro para
ciclos, imports não resolvidos, dependência de domínio/aplicação em infraestrutura, deep imports
entre módulos e acesso a internals de outro módulo. Complementar com `TestingModule` para provar
wiring e exports mínimos.

**Rationale**: convenções de pasta não impedem violações. Uma análise do grafo cobre relações
transitivas e ciclos, enquanto o teste Nest valida a composição real.

**Alternatives considered**: somente ESLint `no-restricted-imports` oferece feedback local, mas
cobre pior ciclos e relações transitivas. `forwardRef()` foi rejeitado como correção arquitetural;
o grafo deve ser redesenhado.

**Sources**: [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md),
[Nest circular dependencies](https://docs.nestjs.com/fundamentals/circular-dependency),
[Nest testing](https://docs.nestjs.com/fundamentals/testing).

## Docker Compose for End-to-End Dependencies

**Decision**: usar `compose.e2e.yaml` dedicado somente às dependências externas dos E2E,
inicialmente PostgreSQL. O runner fica no host/CI, sobe o banco com `up -d --wait`, descobre uma
porta dinâmica em loopback, aplica migrations e executa Vitest. Cada execução usa project name
exclusivo e finaliza com `down -v --remove-orphans`.

**Rationale**: o runner standalone não precisa de imagem própria para provar o fluxo. Porta
dinâmica e project name permitem CI paralelo; healthcheck com `pg_isready` prova readiness; volume
nomeado project-scoped é portátil e removível. Um Compose separado impede subir serviços de
desenvolvimento ou produção por engano.

**Alternatives considered**: Testcontainers foi mantido apenas para integração estreita, pois não
atende ao contrato Compose do E2E. PostgreSQL instalado no runner, porta fixa, volume externo,
`tmpfs` padrão e init scripts no lugar de migrations foram rejeitados por estado residual,
colisões, baixa portabilidade ou semântica incorreta.

**Sources**: [Compose multiple files](https://docs.docker.com/compose/how-tos/multiple-compose-files/),
[Compose up and wait](https://docs.docker.com/reference/cli/docker/compose/up/),
[Compose networking](https://docs.docker.com/compose/how-tos/networking/),
[Compose project names](https://docs.docker.com/compose/how-tos/project-name/),
[Compose down](https://docs.docker.com/reference/cli/docker/compose/down/),
[PostgreSQL pg_isready](https://www.postgresql.org/docs/current/app-pg-isready.html),
[PostgreSQL official image](https://github.com/docker-library/docs/blob/master/postgres/README.md).

## Reproducible and Safe E2E Lifecycle

**Decision**: fixar a imagem PostgreSQL por versão patch, distribuição e digest; não declarar a
chave Compose `version`; não usar `container_name`; publicar a porta somente em `127.0.0.1`; usar
credenciais sintéticas exclusivas de teste e fixtures no lugar de OAuth live. O script valida
`docker compose config -q`, coleta logs em falha e preserva o código de saída antes da limpeza.

**Rationale**: tags são mutáveis; digests tornam o ambiente reproduzível. Names e volumes
project-scoped evitam colisão. Credenciais e recursos descartáveis não podem ser confundidos com
produção. Logs antes do teardown tornam falhas diagnosticáveis sem deixar recursos órfãos.

**Alternatives considered**: tag `latest`/major sem digest, nomes fixos de container, credenciais de
produção e smoke test live dentro dos E2E foram rejeitados por não determinismo, colisão ou risco de
segurança.

**Sources**: [Docker image pinning](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions),
[Compose version and name](https://docs.docker.com/reference/compose-file/version-and-name/),
[Compose services](https://docs.docker.com/reference/compose-file/services/#container_name),
[Compose config](https://docs.docker.com/reference/cli/docker/compose/config/),
[Compose logs](https://docs.docker.com/reference/cli/docker/compose/logs/).

## External Constraints

A extração totalmente automática da Central não é implementável com um contrato público conhecido
e não será simulada por scraping. O design resolve essa limitação com uma entrada manual explícita,
validada e expirada invariavelmente uma hora após a coleta. Portanto, o plano é implementável e
compatível, mas a automação integral de comissão/link permanece condicionada a uma futura
autorização formal do Mercado Livre.

Uma integração automática futura de elegibilidade/comissão/link exige contrato oficial ou
autorização formal; não é requisito para o primeiro release com evidência manual.

## README as Product and Operations Guide

**Decision**: expand the root `README.md` in Brazilian Portuguese using the repository as the source
of truth. Separate current product capabilities from explicit exclusions, then provide a local
walkthrough and a platform-neutral production checklist. Link to the detailed environment,
affiliate-evidence, E2E Compose, and feature quickstart contracts instead of copying them in full.

**Rationale**: the current README has a correct but abbreviated overview and run commands; the
project already has executable scripts and more detailed operational constraints in
`package.json`, `.env.example`, configuration validation, migration scripts, and feature docs. A
single checked walkthrough should reduce onboarding guesswork while retaining detail in the
specialized docs.

**Alternatives considered**: writing platform-specific deployment instructions was rejected
because there is no Dockerfile, production Compose/Helm/Render manifest, release workflow, or chosen
hosting provider. Adding an API/Telegram publishing section as if implemented was rejected because
the current feature ends after selection. Duplicating the complete environment table and every
contract in README was rejected because those details already have canonical documents.

**Repository evidence**: `package.json` defines install/build/run/test/migration scripts;
`.env.example` supplies non-secret configuration placeholders but is not loaded by the application
(`PlatformConfigModule` parses `process.env` directly and no dotenv loading is registered), so local
steps must explicitly export/source concrete values or inject them through a shell/IDE. Migration
scripts invoke `tsx`, currently a devDependency, so migration execution belongs in a release/build
environment that has that package or in a separately provisioned migration image. `src/main.ts` runs a standalone
Nest application context without HTTP; `src/platform/config/environment-config.ts` validates
required schedule, qualification, OAuth, and persistence settings; `scripts/run-migrations.ts`
provides `migration:run` and `migration:status`; `scripts/run-e2e.mjs` owns an isolated Compose
lifecycle; `.github/workflows/ci.yml` proves the CI checks; no application Dockerfile, production
manifest, CONTRIBUTING file, or LICENSE was found. The README must say production migration is a
separate release/deployment step and that exactly one active replica is supported.

## Pre-push Hook and Local Quality Scope

**Decision**: adotar Husky `9.1.7` como `devDependency`, instalado por um `prepare` que chama um
instalador ESM versionado e ignora CI/produção. O arquivo `.husky/pre-push`, sem cabeçalho legado,
executará somente `npm run check:pre-push`. Esse script agregará lint, verificação de formatação,
tipos, arquitetura, testes unitários, de contrato e de integração e build, parando no primeiro erro.

**Rationale**: o repositório usa npm com `package-lock.json`, Node ESM e já possui scripts públicos
para todas essas verificações. Centralizar a composição no `package.json` torna o gate executável e
diagnosticável sem simular um push; deixar o hook como wrapper POSIX reduz lógica específica do Git.
O instalador condicional evita tentar ativar hooks onde não há ambiente de desenvolvimento ou onde
Husky pode ter sido omitido. A versão 9.1.7 é o `latest` publicado no registro npm consultado em
2026-10-01.

**Alternatives considered**: executar `npm test` foi rejeitado porque essa suíte inclui benchmark e
testes PostgreSQL condicionais conforme o ambiente. Incluir `test:e2e` foi rejeitado porque tornaria
todo push dependente de Docker e criaria infraestrutura descartável. `lint-staged` foi rejeitado
porque `pre-push` deve validar o estado completo que será enviado, não apenas arquivos staged. Um
hook Git manual sem Husky foi rejeitado por não oferecer instalação reproduzível via `npm ci`.
Duplicar a composição de comandos dentro de `.husky/pre-push` foi rejeitado por dificultar execução
direta e manutenção.

**CI boundary**: o hook oferece feedback antecipado, mas não é controle de segurança nem substitui
`.github/workflows/ci.yml`. A CI permanece responsável pela suíte agregada, E2E com PostgreSQL em
Docker Compose e Gitleaks. O bypass nativo `--no-verify` não é automatizado nem documentado como
fluxo normal.

**Sources**: [Husky get started](https://typicode.github.io/husky/get-started.html),
[Husky how-to for CI and production](https://typicode.github.io/husky/how-to.html),
[Husky package registry](https://www.npmjs.com/package/husky).
