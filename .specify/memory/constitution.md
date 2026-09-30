<!--
Sync Impact Report
- Version change: unratified scaffold -> 1.0.0
- Modified principles:
  - Placeholder Principle 1 -> I. Qualificacao de Ofertas Baseada em Evidencias
  - Placeholder Principle 2 -> II. Conteudo Fiel, Transparente e Rastreavel
  - Placeholder Principle 3 -> III. Seguranca de Credenciais e Menor Privilegio
  - Placeholder Principle 4 -> IV. Automacao Idempotente e Tolerante a Falhas
  - Placeholder Principle 5 -> V. Observabilidade sem Exposicao de Dados
- Added sections:
  - Restricoes Operacionais e de Integracao
  - Fluxo de Desenvolvimento e Portas de Qualidade
- Removed sections: none
- Follow-up TODOs: none
-->
# Telegram Affiliate Service Constitution

## Core Principles

### I. Qualificacao de Ofertas Baseada em Evidencias

O servico DEVE publicar somente ofertas que atendam a criterios de qualificacao explicitos,
configuraveis e testaveis. A decisao DEVE considerar dados atuais obtidos da origem, incluindo
disponibilidade, preco, desconto quando aplicavel, reputacao ou qualidade do anuncio e
elegibilidade para afiliacao. Cada decisao DEVE registrar os criterios aplicados e os dados que a
sustentaram. Dados ausentes, inconsistentes, expirados ou cuja elegibilidade nao possa ser
confirmada DEVEM impedir a publicacao. Os criterios NAO DEVEM ser alterados silenciosamente para
aumentar o volume de posts.

Rationale: a confianca do canal depende de recomendar oportunidades verificaveis, nao apenas de
maximizar quantidade ou comissao.

### II. Conteudo Fiel, Transparente e Rastreavel

Texto, imagem, preco, desconto e demais alegacoes DEVEM corresponder aos dados validados da oferta
no momento da publicacao. Toda mensagem DEVE identificar de forma clara que utiliza link de
afiliado, conforme as regras vigentes do programa e do canal. O link publicado DEVE ser gerado para
a oferta selecionada, validado antes do envio e rastreavel ate a oferta e a execucao que o criou.
Imagens geradas ou adaptadas NAO DEVEM introduzir caracteristicas, brindes, selos, precos ou
beneficios que nao existam na oferta. Conteudo enganoso, urgencia artificial e alegacoes sem
evidencia sao proibidos.

Rationale: atratividade nunca pode prevalecer sobre exatidao, transparencia e confianca do
publico.

### III. Seguranca de Credenciais e Menor Privilegio

Credenciais do perfil do Mercado Livre, tokens do Telegram Bot, cookies, sessoes e identificadores
sensiveis DEVEM ser fornecidos por mecanismo de segredos e NUNCA armazenados no repositorio, em
fixtures reais ou em logs. Cada integracao DEVE usar o menor conjunto de permissoes necessario.
Dados sensiveis DEVEM ser mascarados em telemetria e mensagens de erro. Falhas de autenticacao,
sessao expirada ou suspeita de comprometimento DEVEM interromper novas publicacoes e produzir um
alerta acionavel. A rotacao ou revogacao de uma credencial DEVE ser possivel sem alteracao de
codigo.

Rationale: o servico opera contas capazes de gerar links e publicar externamente; vazamentos ou
uso indevido possuem impacto financeiro e reputacional direto.

### IV. Automacao Idempotente e Tolerante a Falhas

Cada execucao agendada DEVE ser segura para repeticao. Antes de publicar, o servico DEVE consultar
um registro persistente de publicacoes e bloquear duplicatas conforme uma identidade e uma janela
de repeticao configuraveis. O estado de sucesso somente DEVE ser gravado depois da confirmacao do
Telegram; tentativas inconclusivas DEVEM permanecer distinguiveis de sucessos. Falhas transitorias
PODEM ser repetidas com limite e backoff; falhas permanentes ou validacoes reprovadas NAO DEVEM ser
repetidas automaticamente. Uma falha em uma oferta NAO DEVE corromper o processamento das demais,
e concorrencia entre execucoes NAO DEVE gerar publicacao duplicada.

Rationale: periodicidade, retries e integracoes remotas tornam duplicacao e estado parcial riscos
normais que precisam ser tratados pelo desenho, nao por intervencao manual recorrente.

### V. Observabilidade sem Exposicao de Dados

Cada execucao DEVE emitir eventos estruturados com identificador de correlacao, inicio, fim,
quantidades examinada, qualificada, rejeitada, publicada e falha, alem dos motivos de rejeicao e
falha. Metricas e alertas DEVEM permitir detectar ausencia de execucoes, degradacao das integracoes
e falhas repetidas de publicacao. Logs DEVEM ser suficientes para reproduzir a decisao usando dados
nao sensiveis, mas NUNCA DEVEM conter tokens, cookies, senhas ou links com parametros secretos.
Qualquer operacao externa DEVE possuir timeout explicito.

Rationale: uma automacao sem operador presente precisa provar o que fez e permitir recuperacao
rapida sem comprometer as contas que utiliza.

## Restricoes Operacionais e de Integracao

- A periodicidade, o fuso horario, os criterios de qualificacao, o canal de destino, a janela de
  deduplicacao e os limites de retry DEVEM ser configuraveis fora do codigo.
- Acesso ao Mercado Livre DEVE respeitar os termos, limites, politicas do programa de afiliados e
  mecanismos de integracao vigentes. Uma API oficial ou interface contratada DEVE ser preferida
  quando atender ao caso de uso; automacao de navegador, quando inevitavel, DEVE ficar isolada
  atras de uma porta de integracao substituivel.
- A integracao com o Telegram DEVE usar a API do Bot, confirmar o resultado de cada envio e tratar
  limites de taxa e erros reportados pela plataforma.
- A obtencao da oferta, qualificacao, geracao do link, composicao do conteudo e publicacao DEVEM
  permanecer separadas por contratos claros. Regras de negocio NAO DEVEM depender de detalhes de
  navegador, cliente HTTP, agendador, modelo generativo ou SDK externo.
- Antes do envio, uma validacao final DEVE confirmar elegibilidade, atualidade, destino do link,
  campos obrigatorios, imagem, divulgacao de afiliacao e ausencia de duplicata.
- O sistema DEVE oferecer modo de simulacao que execute coleta, qualificacao e composicao sem
  publicar. A habilitacao inicial em producao DEVE ocorrer somente apos uma execucao simulada
  aprovada.
- Textos e imagens gerados por modelo DEVEM passar por validacoes deterministicas. Indisponibilidade
  do gerador NAO DEVE resultar em conteudo incompleto ou inventado.

## Fluxo de Desenvolvimento e Portas de Qualidade

- Toda mudanca funcional DEVE partir de uma especificacao com cenarios de aceite para selecao,
  link, conteudo, imagem, agendamento, deduplicacao e falhas relevantes.
- Mudancas de regra DEVEM seguir o ciclo teste falhando, implementacao minima e refatoracao. Testes
  unitarios DEVEM cobrir qualificacao, validacao de conteudo e deduplicacao sem acesso a servicos
  externos.
- Contratos de integracao com Mercado Livre, gerador de conteudo e Telegram DEVEM possuir testes de
  contrato ou integracao com doubles controlados. Suites DEVEM cobrir ao menos sessao expirada,
  oferta indisponivel, dados malformados, limite de taxa, link invalido, timeout e falha de envio.
- Uma mudanca NAO PODE ser integrada com testes, analise estatica ou verificacao de segredos
  falhando. Novas excecoes de qualidade exigem justificativa documentada, responsavel e prazo de
  remocao.
- Alteracoes em selecao ou composicao DEVEM demonstrar, por fixture ou simulacao, quais ofertas e
  mensagens seriam aceitas e rejeitadas antes da liberacao.
- Revisoes DEVEM verificar conformidade com esta constituicao, impacto sobre dados e credenciais,
  estrategia de rollback e compatibilidade com publicacoes ja persistidas.

## Governance

Esta constituicao prevalece sobre praticas, planos e documentos conflitantes do projeto. Em caso
de conflito, a especificacao ou implementacao DEVE ser ajustada, ou uma emenda constitucional DEVE
ser aprovada antes da integracao.

Emendas DEVEM ser propostas por escrito com motivacao, impacto nos principios, plano de migracao
quando necessario e atualizacao da versao. A aprovacao exige revisao explicita do mantenedor do
projeto. Excecoes operacionais DEVEM ser documentadas, limitadas no tempo e associadas a um
responsavel; uma excecao nao altera a constituicao.

O versionamento segue SemVer: MAJOR para remocao ou redefinicao incompativel de principio ou regra
de governanca; MINOR para novo principio, nova secao ou ampliacao material; PATCH para
esclarecimentos sem mudanca normativa. A data de ultima alteracao DEVE mudar em toda emenda
aprovada; a data de ratificacao permanece a da primeira adocao.

Toda especificacao e plano DEVEM declarar como satisfazem os principios aplicaveis. Toda revisao de
codigo DEVE executar a verificacao de conformidade. Antes de cada liberacao, o mantenedor DEVE
confirmar as portas de qualidade, a configuracao segura e uma estrategia de recuperacao. Esta
constituicao DEVE ser revisada quando houver mudanca material nas politicas das plataformas, no
modelo de afiliacao ou no fluxo de publicacao e, no minimo, antes de cada liberacao relevante.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
