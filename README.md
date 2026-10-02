# Telegram Affiliate Service

Scheduler standalone em NestJS e TypeScript que pesquisa rankings oficiais do Mercado Livre,
qualifica ofertas de baixo e médio ticket e entrega no máximo um produto completo por execução.
Ele foi criado para automatizar a análise de ofertas sem automatizar o acesso à Central de
Afiliados.

> Escopo atual: a rotina termina na seleção e entrega dos dados do produto. Ela ainda não gera
> texto ou arte promocional nem publica mensagens em um canal do Telegram.

## Sumário

- [O que o serviço faz](#o-que-o-serviço-faz)
- [Arquitetura e fluxo](#arquitetura-e-fluxo)
- [Stack e requisitos](#stack-e-requisitos)
- [Executar localmente](#executar-localmente)
- [Persistência e PostgreSQL](#persistência-e-postgresql)
- [Implantar em produção](#implantar-em-produção)
- [Testes e qualidade](#testes-e-qualidade)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Documentação complementar](#documentação-complementar)

## O que o serviço faz

Em cada execução, o serviço valida de 1 a 10 categorias folha MLB configuradas e consulta os
rankings oficiais dessas categorias. Ele avalia todas as referências retornadas — até 20 por
categoria — usando critérios configuráveis de faixa de preço, desconto, disponibilidade,
popularidade, imagem e elegibilidade para afiliados.

Como o fluxo público utilizado não fornece a evidência de elegibilidade, comissão e link pessoal
necessária para compartilhar uma oferta, esses dados são coletados manualmente nas ferramentas
oficiais de afiliados e entregues à rotina em um arquivo JSON. A evidência deve corresponder ao
mesmo produto e variação, incluir link e comissão e ter no máximo uma hora. O serviço não automatiza
login, navegação autenticada ou scraping da Central de Afiliados.

Os candidatos são ordenados dentro de cada categoria. A rotina revalida os líderes e escolhe zero
ou um produto entre eles por percentual de desconto, comissão esperada e identificador da categoria
como desempate. Rankings de categorias diferentes não são comparados como se formassem uma lista
global de mais vendidos. O caso de uso monta internamente um pacote com preços, comissão, imagem,
link, categoria, posição e justificativa. Com PostgreSQL habilitado, esse pacote é persistido.
**Sem persistência, o scheduler não exporta o pacote para arquivo nem imprime o link afiliado:** ele
emite o resumo sanitizado e o identificador do produto selecionado, mas não retém o restante dos
dados após a execução. Não há atualmente um comando de exportação do pacote.

**Fora do escopo implementado:** geração de copy/imagem para divulgação e publicação via Telegram
Bot. Não há API HTTP nem listener de rede.

## Arquitetura e fluxo

O código é um monólito modular com o bounded context `affiliate-research`, organizado em camadas
DDD e dependências orientadas por portas:

- `domain/`: políticas, value objects, regras de qualificação e seleção, sem dependência de NestJS
  ou TypeORM;
- `application/`: uma rotina de pesquisa que coordena consulta, avaliação, revalidação, seleção,
  persistência opcional e resumo;
- `infrastructure/`: adapters de scheduler, APIs oficiais do Mercado Livre, evidência manual e
  stores PostgreSQL/no-op;
- `src/platform/`: configuração, relógio e observabilidade técnica.

O bootstrap usa um contexto standalone do NestJS: não abre servidor HTTP. O modo `once` executa a
rotina uma vez; o modo `scheduled` mantém o processo ativo segundo o cron e fuso configurados.
Ticks sobrepostos no mesmo processo são descartados, ocorrências perdidas durante indisponibilidade
não são recuperadas e somente uma réplica ativa é suportada.

## Stack e requisitos

| Categoria             | Tecnologia                                      |
| --------------------- | ----------------------------------------------- |
| Runtime               | Node.js 24 ou superior, módulos ESM             |
| Linguagem e framework | TypeScript 6, NestJS 12                         |
| Agendamento           | `cron`                                          |
| Persistência opcional | PostgreSQL 18, TypeORM e `pg`                   |
| Testes                | Vitest e Docker Compose para E2E com PostgreSQL |
| Gate Git local        | Husky 9 com hook `pre-push`                     |

Para desenvolver ou executar a rotina, instale Node.js 24+ e npm. Docker Engine e Docker Compose
v2 são necessários somente para `npm run test:e2e`; o serviço em si não possui imagem ou composição
Docker de desenvolvimento/produção neste repositório. A integração de runtime precisa de acesso de
saída às APIs oficiais do Mercado Livre e credenciais autorizadas.

## Executar localmente

### 1. Instalar dependências

Na raiz do repositório:

```bash
npm ci
```

Em um checkout Git de desenvolvimento, o script `prepare` instala automaticamente o hook Husky.
O instalador não ativa hooks quando `CI=true` ou `NODE_ENV=production`.

### 2. Preparar ambiente e credenciais

Copie o arquivo de exemplo e edite os valores:

```bash
cp .env.example .env
```

Troque os valores ilustrativos por configuração real. Em particular, configure:

- `SCHEDULE_CRON` e `SCHEDULE_TIMEZONE` — ambos obrigatórios, inclusive para execução única;
- `LOW_TICKET_MIN`, `LOW_TICKET_MAX`, `MEDIUM_TICKET_MIN`, `MEDIUM_TICKET_MAX` e
  `MIN_DISCOUNT_PERCENT` — decimais com ponto; as faixas de preço não podem se sobrepor;
- `MELI_CATEGORY_IDS` — de 1 a 10 IDs MLB únicos, válidos e correspondentes a categorias folha;
- `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET` e `MELI_REFRESH_TOKEN` — credenciais autorizadas;
- `AFFILIATE_EVIDENCE_FILE` — caminho absoluto para o arquivo JSON, fora do repositório.

O processo lê `process.env` e **não carrega `.env` automaticamente**. No Bash ou Zsh, depois de
preencher o arquivo com valores compatíveis com a sintaxe de shell, exporte-o no terminal atual:

```bash
set -a
source .env
set +a
npm run config:check
```

Em IDEs, Windows ou ambientes gerenciados, configure as mesmas variáveis diretamente no ambiente
do processo. Nunca versione `.env`, credenciais OAuth, cookies ou links afiliados.

### 3. Preparar evidência manual de afiliado

Na Central de Afiliados, confirme a elegibilidade do produto/variação e obtenha o link de
compartilhamento e os dados de comissão pelas ferramentas oficiais. Registre-os no formato definido
em [`affiliate-evidence.schema.json`](specs/001-qualify-affiliate-products/contracts/affiliate-evidence.schema.json).
Cada evidência deve ter `eligible: true`, `source: "CENTRAL_MANUAL"`, moeda `BRL`,
`productId`, `variationKey` (`NO_VARIATION` quando aplicável), `affiliateUrl`, `commissionPercent`,
`capturedAt`, `sourceReference` e fingerprint SHA-256. `expectedCommissionAmount` é opcional quando
pode ser derivado do percentual. A validade efetiva não ultrapassa uma hora da coleta.

O código contém uma função para calcular o fingerprint sem colocar o link na linha de comando. Com
o arquivo já criado, rode:

```bash
node --import tsx --input-type=module -e 'import { readFile } from "node:fs/promises"; import { evidenceFingerprint } from "./src/modules/affiliate-research/infrastructure/affiliate-evidence/manual-affiliate-evidence.reader.js"; const doc = JSON.parse(await readFile(process.argv.at(-1), "utf8")); for (const entry of doc.entries) console.log(`${entry.productId}:${entry.variationKey} ${evidenceFingerprint(entry)}`);' "$AFFILIATE_EVIDENCE_FILE"
```

Copie o hash correspondente para o campo `fingerprint` de cada entrada. Valide a estrutura JSON com:

```bash
npm run contract:validate -- \
  specs/001-qualify-affiliate-products/contracts/affiliate-evidence.schema.json \
  "$AFFILIATE_EVIDENCE_FILE"
```

Esse comando valida o schema; a rotina também valida fingerprint, vínculo de produto/variação,
elegibilidade, datas, frescor, comissão e destino do link durante a execução. O fixture em
`test/fixtures/` serve apenas para testes e não deve ser usado como evidência comercial.

### 4. Executar uma pesquisa

Para executar uma única vez e encerrar:

```bash
npm run start:once
```

Para iniciar o scheduler residente:

```bash
npm run start:scheduler
```

O comando residente exige `SCHEDULE_CRON` válido e `SCHEDULE_TIMEZONE` IANA válido. Configure o
ambiente antes de iniciar. Se nenhuma persistência estiver habilitada, o serviço não conecta ao
PostgreSQL e não retém histórico. Os resultados e falhas são emitidos em logs JSON sanitizados.

## Persistência e PostgreSQL

`PERSISTENCE_ENABLED` controla o armazenamento:

| Valor            | Comportamento                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `false` (padrão) | Usa adapter no-op; não inicializa driver ou conexão, não retém histórico nem exporta o pacote completo. |
| `true`           | Exige `DATABASE_URL` e migrations; persiste resumo e pacote selecionado, sem fallback silencioso.       |

Para habilitar localmente, provisione um PostgreSQL separado do banco E2E, defina `PERSISTENCE_ENABLED=true`,
`DATABASE_URL` e, conforme o ambiente, `DATABASE_SSL`. Depois de exportar as variáveis na shell:

```bash
npm run migration:run
npm run migration:status
npm run start:once
```

Migrations não são aplicadas automaticamente pelo scheduler. Com armazenamento ativo, execuções
terminais e seus dados relacionados são retidos por 90 dias; há limpeza no startup antes de qualquer
pesquisa e manutenção horária UTC no modo residente.

### Testes E2E com Docker Compose

```bash
npm run test:e2e
```

Esse comando sobe somente o PostgreSQL de teste em um projeto Compose isolado, aplica migrations,
executa os E2E com fixtures e remove container, rede e volume temporários ao terminar. Não é um
ambiente de desenvolvimento persistente e não deve ser usado em produção. A suíte não usa
credenciais OAuth reais nem chamadas live ao Mercado Livre.

## Implantar em produção

O repositório não define provedor de hospedagem, Dockerfile da aplicação, Compose de produção,
manifesto Kubernetes/Helm ou workflow de deploy. A sequência abaixo é um checklist operacional
genérico; configure host, container e supervisor conforme a plataforma escolhida.

1. **Provisionar o processo:** Linux com Node.js 24+, acesso de saída às APIs oficiais do Mercado
   Livre e capacidade de manter um processo residente. Planeje exatamente uma réplica ativa por
   ambiente.
2. **Configurar o ambiente:** forneça `NODE_ENV=production`, `EXECUTION_MODE=scheduled`, cron,
   fuso IANA, faixas de preço, desconto, categorias MLB folha e credenciais OAuth pelo mecanismo de
   variáveis/secrets da plataforma. O app não carrega arquivos `.env`.
3. **Disponibilizar a evidência manual:** monte ou disponibilize o arquivo JSON num caminho absoluto
   legível, fora do Git e protegido como dado sensível. Atualize a evidência manualmente antes de
   expirar; não habilite automação de login/scraping.
4. **Decidir sobre PostgreSQL:** com `PERSISTENCE_ENABLED=false`, nenhum histórico é retido. Com
   `true`, provisione PostgreSQL 18, configure `DATABASE_URL` e TLS (`DATABASE_SSL`) segundo a
   política da plataforma e execute as migrations como etapa de release antes de iniciar a nova
   versão. Os scripts de migration usam `tsx`, hoje uma dependência de desenvolvimento; execute-os
   num ambiente de release que instale as dependências completas (`npm ci`).
5. **Compilar e migrar:** no ambiente de release com as variáveis de produção disponíveis, execute:

   ```bash
   npm ci
   npm run build
   npm run migration:run
   npm run migration:status
   ```

   Se o armazenamento estiver desligado, pule as duas etapas de migration. Elas não são executadas
   automaticamente no startup.

6. **Iniciar o scheduler:** com a configuração e artefato compilado disponíveis, inicie `npm start`
   sob o supervisor de processos escolhido. O script executa `node dist/main.js`; mantenha o processo
   residente e permita que receba `SIGTERM` para shutdown ordenado. Observe os logs JSON sanitizados
   e configure supervisão/alertas na plataforma, pois o serviço não envia notificações externas.

   Exemplo de comando de entrada, supondo que as demais variáveis já foram injetadas pelo ambiente:

   ```bash
   NODE_ENV=production EXECUTION_MODE=scheduled npm start
   ```

7. **Operar com a limitação de agendamento:** ticks concorrentes são descartados; horários perdidos
   durante downtime não são recuperados. Corrija a causa da indisponibilidade e deixe o scheduler
   aguardar a próxima ocorrência futura. Não rode mais de uma réplica.

Não trate `compose.e2e.yaml` como manifesto de deploy. Ele é exclusivo da suíte de testes e remove os
recursos temporários no final.

## Testes e qualidade

Os comandos abaixo estão definidos em `package.json`:

| Comando                     | Finalidade                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run check:pre-push`    | Gate local: lint, formato, tipos, arquitetura, testes isolados e build.                          |
| `npm test`                  | Suíte Vitest; testes PostgreSQL condicionais também rodam se `DATABASE_URL` estiver no ambiente. |
| `npm run test:unit`         | Testes unitários.                                                                                |
| `npm run test:contract`     | Testes de contratos.                                                                             |
| `npm run test:integration`  | Testes de integração.                                                                            |
| `npm run test:architecture` | Verifica limites e dependências do monólito modular.                                             |
| `npm run test:performance`  | Benchmark determinístico com fixtures e latências simuladas.                                     |
| `npm run test:e2e`          | E2E com PostgreSQL temporário via Docker Compose.                                                |
| `npm run lint`              | ESLint.                                                                                          |
| `npm run format:check`      | Verificação Prettier.                                                                            |
| `npm run typecheck`         | Verificação TypeScript sem emitir build.                                                         |
| `npm run build`             | Compila a aplicação em `dist/`.                                                                  |

Para validar localmente o conjunto principal:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:architecture
npm test
npm run test:performance
npm run build
```

O hook `.husky/pre-push` executa `npm run check:pre-push` e bloqueia o push ao primeiro erro. Ele
não modifica arquivos nem inicia Docker, PostgreSQL ou chamadas de rede. O E2E, o benchmark
dedicado e a varredura de segredos permanecem na CI, que é a verificação final de integração.

Execute `npm run test:e2e` quando Docker Engine e Compose v2 estiverem disponíveis.

## Estrutura do projeto

```text
src/
├── modules/affiliate-research/
│   ├── domain/            # regras e modelos de domínio
│   ├── application/       # portas e rotina de pesquisa
│   └── infrastructure/   # Mercado Livre, evidência, scheduler e persistência
└── platform/              # configuração e observabilidade
test/                      # suites unit, contract, integration, e2e e fixtures
specs/001-qualify-affiliate-products/  # especificação e contratos operacionais
scripts/                   # migrations e execução do E2E Compose
```

## Documentação complementar

- [Especificação funcional](specs/001-qualify-affiliate-products/spec.md)
- [Plano técnico e decisões arquiteturais](specs/001-qualify-affiliate-products/plan.md)
- [Modelo de domínio e persistência](specs/001-qualify-affiliate-products/data-model.md)
- [Guia completo de validação/quickstart](specs/001-qualify-affiliate-products/quickstart.md)
- [Contrato de ambiente e variáveis](specs/001-qualify-affiliate-products/contracts/environment.md)
- [Formato da evidência manual](specs/001-qualify-affiliate-products/contracts/affiliate-evidence.schema.json)
- [Contrato da integração Mercado Livre](specs/001-qualify-affiliate-products/contracts/mercado-livre-gateway.md)
- [Contrato E2E Docker Compose](specs/001-qualify-affiliate-products/contracts/e2e-compose.md)

Este repositório não contém arquivo `LICENSE`; portanto, nenhuma licença é declarada aqui.
