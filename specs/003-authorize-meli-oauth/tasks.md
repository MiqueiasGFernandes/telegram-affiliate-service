# Tasks: Autorização inicial do Mercado Livre

**Input**: Design documents from `/specs/003-authorize-meli-oauth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md, quickstart.md

**Tests**: Obrigatórios por especificação e constituição. Em cada história, escrever e executar os testes falhando antes da implementação.

**Organization**: Tasks are grouped by user story so each behavior remains independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files with no unfinished dependency
- **[Story]**: Maps the task to US1, US2 or US3 from spec.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the module and executable surface without adding behavior.

- [X] T001 Create the authorization module directory structure from plan.md under `src/modules/mercado-livre-authorization/`, `test/unit/mercado-livre-authorization/`, and `test/integration/mercado-livre-authorization/`
- [X] T002 Add the `meli:authorize` command entry and `MELI_REDIRECT_URI` placeholder while replacing any credential-like example values with placeholders in `package.json` and `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the inward-facing contracts needed by every story.

- [X] T003 [P] Define authorization interaction and token gateway contracts in `src/modules/mercado-livre-authorization/application/ports/authorization-interaction.port.ts` and `src/modules/mercado-livre-authorization/application/ports/authorization-token-gateway.port.ts`
- [X] T004 [P] Define the refresh-token persistence contract in `src/modules/mercado-livre-authorization/application/ports/refresh-token-store.port.ts`

**Checkpoint**: Application boundaries are ready and contain no Node.js, HTTP, terminal, or filesystem details.

---

## Phase 3: User Story 1 - Autorizar a conta e obter o token (Priority: P1) 🎯 MVP

**Goal**: Guide the operator through consent, validate the returned URL, exchange the code and hand the refresh token to storage without displaying it.

**Independent Test**: With faked interaction, gateway and store, verify a valid callback completes exactly one exchange and one store operation; with a controlled HTTP response, verify the official request shape and PKCE values.

### Tests for User Story 1

- [X] T005 [P] [US1] Write failing use-case tests for generated state/PKCE, authorization URL, callback validation and successful storage in `test/unit/mercado-livre-authorization/authorize-mercado-livre.spec.ts`
- [X] T006 [P] [US1] Write failing HTTP adapter tests for form-encoded code exchange, timeout signal and valid refresh-token mapping in `test/integration/mercado-livre-authorization/mercado-livre-oauth-client.integration.spec.ts`

### Implementation for User Story 1

- [X] T007 [US1] Implement the authorization attempt, URL/callback validation and orchestration use case in `src/modules/mercado-livre-authorization/application/use-cases/authorize-mercado-livre.use-case.ts`
- [X] T008 [US1] Implement the official authorization and token exchange adapter with PKCE S256 and explicit timeout in `src/modules/mercado-livre-authorization/infrastructure/oauth/mercado-livre-oauth.client.ts`
- [X] T009 [US1] Implement the thin interactive terminal adapter and composition entrypoint without printing secrets in `src/modules/mercado-livre-authorization/infrastructure/cli/authorize-mercado-livre.cli.ts`

**Checkpoint**: The authorization journey works with an in-memory token store and controlled provider.

---

## Phase 4: User Story 2 - Rejeitar retornos inválidos com segurança (Priority: P2)

**Goal**: Produce distinct actionable failures while guaranteeing sensitive values are absent from output.

**Independent Test**: Supply mismatched state, denied consent, timeout, remote rejection and malformed response containing sentinel secrets; verify the expected error category, no store call and no sentinel in output.

### Tests for User Story 2

- [X] T010 [US2] Extend failing use-case tests with invalid callback URI, missing code, denied consent, state mismatch and zero side effects in `test/unit/mercado-livre-authorization/authorize-mercado-livre.spec.ts`
- [X] T011 [US2] Extend failing adapter and CLI tests with timeout, non-JSON, rejected and secret-bearing responses, asserting sanitized output in `test/integration/mercado-livre-authorization/mercado-livre-oauth-client.integration.spec.ts` and `test/integration/mercado-livre-authorization/authorization-cli.integration.spec.ts`

### Implementation for User Story 2

- [X] T012 [US2] Add fixed typed authorization failures and safe error translation to `src/modules/mercado-livre-authorization/application/use-cases/authorize-mercado-livre.use-case.ts` and `src/modules/mercado-livre-authorization/infrastructure/oauth/mercado-livre-oauth.client.ts`
- [X] T013 [US2] Complete terminal validation, non-TTY rejection and sanitized exit handling in `src/modules/mercado-livre-authorization/infrastructure/cli/authorize-mercado-livre.cli.ts`

**Checkpoint**: All specified failure paths are distinguishable and reveal no credentials.

---

## Phase 5: User Story 3 - Preservar a configuração local (Priority: P3)

**Goal**: Create or atomically update only `MELI_REFRESH_TOKEN` in `.env`, preserving all other content and restricting file access.

**Independent Test**: In a temporary directory, store a sentinel token into absent and existing files; verify exactly one active target entry, preserved unrelated content, mode 0600 and unchanged original after an injected write failure.

### Tests for User Story 3

- [X] T014 [US3] Write failing integration tests for create, replace, duplicate cleanup, escaping, 0600 mode and rollback on failure in `test/integration/mercado-livre-authorization/local-env-file.integration.spec.ts`

### Implementation for User Story 3

- [X] T015 [US3] Implement `.env` loading with process-environment precedence and atomic owner-only refresh-token storage in `src/modules/mercado-livre-authorization/infrastructure/config/local-env-file.ts`
- [X] T016 [US3] Wire local configuration and the concrete refresh-token store into the command composition in `src/modules/mercado-livre-authorization/infrastructure/cli/authorize-mercado-livre.cli.ts`

**Checkpoint**: The full command stores the initial token locally without altering unrelated configuration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Synchronize documentation and execute every quality gate.

- [X] T017 [P] Document setup, command usage, manual consent boundary and rotation limitation in `README.md`
- [X] T018 [P] Update the OAuth environment contract with `MELI_REDIRECT_URI` and bootstrap behavior in `specs/001-qualify-affiliate-products/contracts/environment.md`
- [X] T019 Run the focused unit and integration scenarios from `specs/003-authorize-meli-oauth/quickstart.md` and mark completed tasks in `specs/003-authorize-meli-oauth/tasks.md`
- [X] T020 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test:architecture`, `npm run test:unit`, `npm run test:contract`, `npm run test:integration`, and `npm run build`, fixing only feature-related failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: No dependencies.
- **Foundational**: Depends on Setup and blocks all stories.
- **US1**: Depends on Foundational and delivers the MVP orchestration.
- **US2**: Depends on the US1 flow because it hardens its failure paths.
- **US3**: Depends on the US1 storage port but can be developed in parallel with US2 after US1.
- **Polish**: Depends on all selected stories.

### User Story Dependencies

```text
Setup -> Foundational -> US1 -> US2
                          \-> US3
US2 + US3 -> Polish
```

### Parallel Opportunities

- T003 and T004 define separate ports.
- T005 and T006 cover separate application and HTTP boundaries.
- After US1, US2 and US3 can proceed independently.
- T017 and T018 update separate documentation files.

## Parallel Example: User Story 1

```text
Task T005: Write use-case tests in test/unit/mercado-livre-authorization/authorize-mercado-livre.spec.ts
Task T006: Write HTTP adapter tests in test/integration/mercado-livre-authorization/mercado-livre-oauth-client.integration.spec.ts
```

## Implementation Strategy

### MVP First

1. Complete T001-T004.
2. Complete T005-T009 using Red-Green-Refactor.
3. Validate US1 with controlled adapters before adding hardening or filesystem persistence.

### Incremental Delivery

1. US1 delivers the guided OAuth flow behind ports.
2. US2 makes every failure safe and actionable.
3. US3 adds durable local bootstrap storage.
4. Polish synchronizes documentation and proves all gates.

## Format Validation

All 20 tasks use the required checkbox, sequential task ID, optional parallel marker, required story label inside story phases, and explicit file path or validation command.
