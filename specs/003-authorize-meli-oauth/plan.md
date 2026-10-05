# Implementation Plan: Autorização inicial do Mercado Livre

**Branch**: `003-authorize-meli-oauth` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-authorize-meli-oauth/spec.md`

## Summary

Adicionar um comando npm interativo que usa as credenciais externas existentes para criar uma solicitação OAuth segura, orienta o consentimento no navegador, valida a URL de retorno colada pelo operador, troca o código pelo refresh token e atualiza `.env` atomicamente sem exibir segredos. O desenho separa a orquestração da autorização, o cliente HTTP, a interação de terminal e o armazenamento local para permitir testes sem rede real.

## Technical Context

**Language/Version**: TypeScript 6 em Node.js 24+

**Primary Dependencies**: APIs nativas de `node:crypto`, `node:fs`, `node:readline`, `URL` e `fetch`; nenhuma dependência de produção nova

**Storage**: Arquivo local `.env`, ignorado pelo Git, atualizado por arquivo temporário e renomeação atômica

**Testing**: Vitest 4, doubles injetados e servidor HTTP controlado somente nos testes de integração

**Target Platform**: Processo CLI em Linux com Node.js 24+

**Project Type**: Serviço standalone com comando operacional CLI

**Performance Goals**: Operação local inicia em menos de 1 segundo e conclui a troca em até 10 segundos quando o provedor responde normalmente

**Constraints**: Sem endpoint HTTP de entrada permanente; URI de retorno deve coincidir exatamente com a cadastrada; timeout explícito; nenhum segredo em logs; nenhuma chamada live nos testes

**Scale/Scope**: Uma autorização interativa por processo e um arquivo de configuração local

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Qualificação baseada em evidências**: Não altera seleção nem publicação de ofertas; não aplicável ao fluxo operacional.
- **II. Conteúdo fiel e rastreável**: Não produz conteúdo ou links de afiliado; não aplicável.
- **III. Segurança de credenciais**: PASSA. Entradas vêm de ambiente/arquivo ignorado, o token é gravado com permissão restrita, e mensagens nunca incluem segredos.
- **IV. Automação idempotente e tolerante a falhas**: PASSA. O arquivo só muda depois de uma resposta válida; escrita atômica impede estado parcial. Repetir o fluxo cria uma nova tentativa com novo estado.
- **V. Observabilidade sem exposição**: PASSA. Saída informa somente etapas e erros sanitizados; chamada externa tem timeout.
- **Integrações oficiais**: PASSA. Usa somente endpoints OAuth oficiais e requer consentimento do titular.
- **Portas de qualidade**: PASSA. Casos de sucesso, estado divergente, recusa, timeout, resposta malformada e persistência serão cobertos sem rede live.

**Post-design re-check**: PASSA sem exceções. Contrato CLI, modelo e quickstart mantêm a credencial fora de logs e do repositório e não introduzem entrada HTTP permanente.

## Project Structure

### Documentation (this feature)

```text
specs/003-authorize-meli-oauth/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli.md
└── tasks.md
```

### Source Code (repository root)

```text
src/modules/mercado-livre-authorization/
├── application/
│   ├── ports/
│   │   ├── authorization-interaction.port.ts
│   │   ├── authorization-token-gateway.port.ts
│   │   └── refresh-token-store.port.ts
│   └── use-cases/authorize-mercado-livre.use-case.ts
└── infrastructure/
    ├── cli/authorize-mercado-livre.cli.ts
    ├── config/local-env-file.ts
    └── oauth/mercado-livre-oauth.client.ts

test/unit/mercado-livre-authorization/
└── authorize-mercado-livre.spec.ts

test/integration/mercado-livre-authorization/
└── authorization-cli.integration.spec.ts
```

**Structure Decision**: Um módulo operacional separado evita misturar o bootstrap de credenciais com o domínio de pesquisa. A aplicação depende de portas pequenas; CLI, HTTP e arquivo local permanecem em infraestrutura. O entrypoint fica sob `src/` para participar de typecheck, lint, build e regras arquiteturais existentes.

## Complexity Tracking

Nenhuma violação constitucional ou complexidade excepcional foi identificada.
