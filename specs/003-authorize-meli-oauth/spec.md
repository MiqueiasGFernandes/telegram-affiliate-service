# Feature Specification: Autorização inicial do Mercado Livre

**Feature Branch**: `003-authorize-meli-oauth`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Criar um script npm que automatize a obtenção inicial do MELI_REFRESH_TOKEN a partir de um client_id e client_secret existentes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autorizar a conta e obter o token (Priority: P1)

Como operador do serviço, quero iniciar uma autorização guiada do Mercado Livre usando as credenciais já configuradas, para obter o refresh token necessário sem montar manualmente requisições OAuth.

**Why this priority**: Sem o refresh token, o serviço não consegue autenticar as consultas oficiais ao Mercado Livre.

**Independent Test**: Com credenciais e URI de retorno válidas, executar o comando, autorizar uma conta em um provedor controlado, informar o retorno recebido e verificar que o token foi salvo sem ser exibido.

**Acceptance Scenarios**:

1. **Given** credenciais e URI de retorno válidas, **When** o operador inicia o comando, autoriza a conta e fornece o retorno correspondente, **Then** o sistema troca o código por tokens e armazena o refresh token sem exibi-lo.
2. **Given** que a autorização ainda depende do titular da conta, **When** o comando é iniciado, **Then** ele apresenta uma URL oficial de autorização e instruções claras para completar apenas o login e o consentimento manualmente.

---

### User Story 2 - Rejeitar retornos inválidos com segurança (Priority: P2)

Como operador, quero receber erros acionáveis quando a autorização falhar, sem que client secret, código de autorização ou tokens apareçam nas mensagens.

**Why this priority**: Diagnóstico seguro evita vazamento de credenciais e reduz o risco de repetir um fluxo inválido.

**Independent Test**: Simular retorno com estado divergente, resposta remota recusada e resposta malformada, verificando falha, mensagem orientativa e ausência de segredos na saída.

**Acceptance Scenarios**:

1. **Given** um retorno cujo identificador de estado não corresponde à solicitação, **When** o operador o fornece, **Then** o comando rejeita a tentativa antes de solicitar tokens.
2. **Given** que o provedor recusa ou devolve uma resposta sem refresh token, **When** a troca é realizada, **Then** o comando termina com erro acionável e não revela dados sensíveis.

---

### User Story 3 - Preservar a configuração local (Priority: P3)

Como operador, quero que o novo refresh token seja salvo na configuração local sem apagar as demais variáveis, para poder iniciar o serviço depois da autorização.

**Why this priority**: Automatizar a troca mas exigir edição manual do segredo manteria um passo sensível e sujeito a erro.

**Independent Test**: Autorizar usando um arquivo local com configurações preexistentes e verificar que somente a entrada do refresh token foi criada ou substituída, com acesso restrito ao proprietário.

**Acceptance Scenarios**:

1. **Given** um arquivo local com outras configurações, **When** a autorização termina, **Then** todas as demais entradas são preservadas e apenas o refresh token é atualizado.
2. **Given** que o arquivo local ainda não existe, **When** a autorização termina, **Then** ele é criado fora do controle de versão com acesso restrito ao proprietário.

### Edge Cases

- Credenciais ou URI de retorno ausentes ou vazias impedem o início do fluxo.
- O retorno pode ser informado como URL completa; código ou estado ausentes são rejeitados.
- Um retorno com erro ou consentimento negado não inicia a troca de tokens.
- Estado divergente ou reutilização de uma tentativa concluída é rejeitado.
- Timeout, indisponibilidade, resposta não JSON ou resposta sem refresh token não altera a configuração existente.
- Valores de configuração contendo espaços, aspas ou quebras de linha não podem corromper o arquivo local.
- Falha ao gravar a configuração termina com erro sem imprimir o token recebido.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer um único comando de projeto para iniciar a autorização inicial do Mercado Livre.
- **FR-002**: O comando DEVE exigir o identificador do aplicativo, o segredo do aplicativo e a URI de retorno por configuração externa ao código.
- **FR-003**: O comando DEVE criar uma tentativa com identificador de estado imprevisível e apresentar uma URL oficial de autorização vinculada a essa tentativa.
- **FR-004**: O operador DEVE conseguir fornecer a URL completa recebida no retorno da autorização.
- **FR-005**: O comando DEVE validar que o estado recebido corresponde exatamente ao estado da tentativa antes de trocar o código.
- **FR-006**: O comando DEVE trocar o código de autorização usando somente o canal oficial e com tempo limite explícito.
- **FR-007**: O comando DEVE exigir um refresh token válido na resposta antes de considerar a autorização concluída.
- **FR-008**: O comando DEVE criar ou atualizar somente a configuração local do refresh token, preservando as demais configurações.
- **FR-009**: O arquivo local criado ou atualizado DEVE permanecer fora do controle de versão e acessível somente pelo proprietário sempre que o sistema operacional permitir.
- **FR-010**: Segredo do aplicativo, código de autorização, access token e refresh token NÃO DEVEM aparecer em logs, erros ou saída normal.
- **FR-011**: Falhas anteriores à persistência bem-sucedida NÃO DEVEM alterar nem truncar a configuração existente.
- **FR-012**: O comando DEVE terminar com estado de sucesso somente depois que o refresh token estiver armazenado.
- **FR-013**: O comando DEVE orientar nova autorização quando o provedor negar consentimento, recusar o código ou não fornecer refresh token.
- **FR-014**: O fluxo DEVE ser verificável com um provedor controlado, sem utilizar credenciais ou chamadas reais nos testes automatizados.
- **FR-015**: O comando de autorização inicial NÃO DEVE prometer persistência das rotações futuras realizadas pelo serviço em execução.

### Key Entities

- **Tentativa de autorização**: Representa uma execução ainda não concluída, identificada por estado imprevisível e vinculada à URI de retorno.
- **Retorno de autorização**: Contém o código temporário, o estado devolvido ou um erro informado pelo provedor.
- **Credencial renovável**: Representa o refresh token recebido e armazenado como segredo, sem exposição em saída observável.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador com credenciais válidas conclui a obtenção e o armazenamento inicial do refresh token em até 3 minutos, excluindo o tempo gasto no login e consentimento externos.
- **SC-002**: 100% dos cenários automatizados de sucesso preservam todas as configurações locais não relacionadas ao refresh token.
- **SC-003**: 100% dos cenários automatizados de falha mantêm a configuração anterior intacta.
- **SC-004**: Nenhum segredo ou token usado nas verificações aparece na saída normal ou de erro.
- **SC-005**: Estado divergente, consentimento negado, timeout e resposta sem refresh token são diagnosticados de forma distinta e acionável.

## Assumptions

- O operador já possui um aplicativo do Mercado Livre com permissão de acesso offline e uma URI de retorno HTTPS cadastrada.
- O operador utiliza a conta principal autorizada e completa pessoalmente o login e o consentimento exigidos pelo provedor.
- O arquivo local de configuração do projeto está excluído do controle de versão.
- A primeira versão recebe a URL de retorno por entrada do operador; hospedar um endpoint HTTPS permanente está fora do escopo.
- Persistir automaticamente cada refresh token rotacionado durante a execução normal é uma necessidade separada e não faz parte deste comando de autorização inicial.
