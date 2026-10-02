# Feature Specification: Artefatos de Deployment do Backend

**Feature Branch**: `002-deployment-platform`
**Created**: 2026-10-02
**Status**: Draft
**Input**: User description: "Vamos configurar a plataforma de deployment deste backend. Primeiro preciso do Script de DDL para gerar as tabelas do banco de dados. Depois preciso do Dockerfile da Imagem"

## User Scenarios & Testing

### User Story 1 - Provisionar o schema PostgreSQL (Priority: P1)

Como operador do backend, quero um script SQL de DDL que crie o schema exigido pela versão atual da aplicação, para provisionar um banco PostgreSQL vazio antes do deployment.

**Why this priority**: Com persistência habilitada, a aplicação exige as migrations aplicadas antes de iniciar.

**Independent Test**: Executar o script em PostgreSQL vazio e comparar tabelas, constraints e índices resultantes com as migrations versionadas.

**Acceptance Scenarios**:

1. **Given** um banco PostgreSQL vazio, **When** o script DDL é aplicado, **Then** as tabelas, chaves, checks e índice necessários à persistência atual existem.
2. **Given** que o banco contém o schema criado pelo script, **When** o serviço inicia com persistência habilitada, **Then** ele reconhece o schema e não tenta alterar tabelas automaticamente.
3. **Given** schema incompatível ou aplicação SQL incompleta, **When** o operador valida o banco, **Then** o erro é visível e o serviço não inicia em modo de persistência como se o banco estivesse pronto.

### User Story 2 - Construir e executar a imagem do backend (Priority: P2)

Como operador, quero uma imagem OCI reproduzível do processo Node.js, para executar o serviço em plataformas compatíveis com containers.

**Why this priority**: A imagem é o artefato que será implantado depois que o schema estiver provisionado.

**Independent Test**: Construir a imagem a partir do repositório, executá-la com configuração válida e verificar que o processo inicia sem publicar portas e sem executar DDL automaticamente.

**Acceptance Scenarios**:

1. **Given** o código e lockfile do repositório, **When** a imagem é construída, **Then** a compilação reproduzível inclui somente os arquivos necessários à execução.
2. **Given** variáveis de ambiente válidas e schema previamente preparado, **When** o container inicia, **Then** executa o backend em modo configurado sem expor portas HTTP.
3. **Given** configuração obrigatória ausente ou inválida, **When** o container inicia, **Then** encerra com erro claro sem registrar segredos.
4. **Given** um runtime de container compatível, **When** o processo recebe SIGTERM, **Then** encerra de forma controlada conforme o tratamento de shutdown existente.

## Edge Cases

- PostgreSQL fora da faixa de versão suportada ou schema parcialmente aplicado.
- Divergência entre o SQL de deployment e migrations futuras.
- Build sem lockfile ou com dependências de desenvolvimento ausentes antes da compilação.
- Variáveis de persistência habilitada sem `DATABASE_URL`.
- `DATABASE_URL` com credenciais ou query parameters sensíveis expostos em logs.
- Execução do container em arquitetura ou plataforma OCI diferente da máquina de build.
- SIGTERM durante uma execução agendada.

## Requirements

### Functional Requirements

- **FR-001**: O projeto MUST fornecer um script SQL autocontido para criar o schema PostgreSQL necessário à persistência implementada.
- **FR-002**: O DDL MUST refletir tabelas, colunas, tipos, relações, checks, unicidades e índices definidos pelas migrations atuais.
- **FR-003**: O DDL MUST documentar a versão do schema e sua relação com as migrations; mudanças futuras de persistência MUST manter ambos sincronizados.
- **FR-004**: A aplicação MUST continuar com migrations automáticas e `synchronize` desabilitados durante o startup.
- **FR-005**: O projeto MUST fornecer um Dockerfile reproduzível baseado no lockfile, compilando TypeScript antes de criar a imagem de runtime.
- **FR-006**: A imagem de runtime MUST executar o processo `node dist/main.js`, não publicar portas HTTP e não incluir segredos ou configuração de ambiente específica.
- **FR-007**: O container MUST executar como usuário não privilegiado e receber configuração e segredos por variáveis/secret manager externo.
- **FR-008**: A imagem MUST permanecer compatível com o requisito de Node.js 24 ou superior e com a configuração de execução de instância única definida pelo serviço.
- **FR-009**: A documentação MUST descrever build, fornecimento de variáveis, pré-requisito de aplicação do DDL e execução do container sem assumir um provedor específico.
- **FR-010**: O container MUST propagar sinais de término ao processo Node e permitir encerramento gracioso.

### Key Entities

- **Schema de pesquisa**: execução, cobertura por categoria, referências de candidatos, ofertas avaliadas e produto selecionado; estrutura atualmente definida pelas migrations PostgreSQL do bounded context `affiliate-research`.
- **Imagem de aplicação**: artefato OCI imutável, construído de uma revisão do código e executando o processo agendado em ambiente Linux.

## Assumptions

- O destino aceita imagens OCI/Docker e fornecerá as variáveis de ambiente exigidas pela aplicação.
- O PostgreSQL é provisionado externamente; o container da aplicação não inclui nem gerencia um servidor de banco.
- O DDL atende deployment a partir de banco vazio; evolução de schema continua versionada junto às migrations.
- A plataforma manterá exatamente uma réplica ativa por ambiente, conforme o requisito do scheduler.
