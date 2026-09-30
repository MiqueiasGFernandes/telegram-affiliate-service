# Feature Specification: Pesquisa e Seleção de Produtos Afiliados

**Feature Branch**: Não criado (hook de branch não configurado)

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Crie uma rotina de pesquisa na minha página de Central de Afiliados no Meli para encontrar produtos de low/médio ticket qualificáveis. Esta análise deve selecionar um dos produtos mais vendidos para ser publicado e extrair dele preço original, preço com desconto (atrativo ao público), meu link de afiliado do produto para compartilhamento, valor esperado de comissão/percentual de ganho, título do produto e imagem principal do produto"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Qualificar ofertas de baixo e médio ticket (Priority: P1)

Como responsável pelo canal de afiliados, quero pesquisar as ofertas disponíveis no meu perfil e
separar somente produtos que atendam à política de preço, desconto, elegibilidade, popularidade e
completude, para não promover ofertas inadequadas ou sem evidência suficiente.

**Why this priority**: Sem um conjunto confiável de candidatos, qualquer seleção ou conteúdo
posterior pode divulgar uma oferta inválida, pouco atrativa ou não comissionável.

**Independent Test**: Pode ser testada com um conjunto conhecido de ofertas válidas e inválidas e
uma política de qualificação definida, verificando a lista de candidatos e o motivo registrado para
cada rejeição, sem realizar seleção final ou publicação.

**Acceptance Scenarios**:

1. **Given** uma sessão autorizada, uma política válida e ofertas com diferentes preços e
   descontos, **When** a pesquisa é executada, **Then** somente ofertas que satisfazem todos os
   critérios são qualificadas.
2. **Given** uma pesquisa com múltiplas páginas e uma oferta repetida, **When** todo o escopo é
   analisado, **Then** cada produto único é avaliado uma única vez e nenhuma página é ignorada.
3. **Given** uma oferta sem elegibilidade, disponibilidade, desconto mínimo, popularidade,
   comissão ou algum dado obrigatório, **When** ela é avaliada, **Then** é rejeitada com um motivo
   específico e não aparece entre os candidatos.
4. **Given** que nenhuma oferta atende aos critérios, **When** a pesquisa termina, **Then** a
   execução é concluída sem produto selecionado e informa as quantidades e razões de rejeição.

---

### User Story 2 - Selecionar o produto mais vendido elegível (Priority: P2)

Como responsável pelo canal, quero que a rotina escolha exatamente um dos candidatos com a melhor
evidência comparável de vendas, para priorizar produtos com maior aceitação do público sem abrir
mão dos critérios de preço e atratividade.

**Why this priority**: A seleção transforma o conjunto qualificado em uma decisão acionável e
reproduzível para o fluxo posterior de divulgação.

**Independent Test**: Pode ser testada fornecendo uma lista preparada de candidatos qualificados
com indicadores de vendas e empates conhecidos, verificando se exatamente um item é escolhido
pelas regras de ordenação definidas.

**Acceptance Scenarios**:

1. **Given** candidatos qualificados com indicadores de vendas comparáveis, **When** a seleção é
   executada, **Then** o candidato com o indicador mais forte é escolhido.
2. **Given** candidatos empatados no indicador de vendas, **When** a seleção é executada, **Then**
   vence, em ordem, o maior percentual de desconto, o maior valor esperado de comissão e a ordem
   estável apresentada pela origem.
3. **Given** candidatos cujos indicadores de popularidade não são comparáveis, **When** a seleção é
   executada, **Then** nenhum deles é escolhido com base em suposição e a limitação é registrada.

---

### User Story 3 - Entregar dados completos para divulgação (Priority: P3)

Como responsável pelo canal, quero receber um registro completo e rastreável do produto escolhido,
para que o conteúdo de divulgação possa ser preparado sem copiar dados manualmente nem misturar
informações de produtos ou variações diferentes.

**Why this priority**: A seleção só gera valor operacional quando contém todos os dados necessários
para criar uma publicação fiel e com link comissionável.

**Independent Test**: Pode ser testada a partir de um produto já selecionado, verificando a
presença, origem, consistência e atualidade de cada campo do pacote final, sem gerar texto ou
publicar em canal externo.

**Acceptance Scenarios**:

1. **Given** um produto selecionado e ainda válido, **When** o pacote é finalizado, **Then** ele
   contém título, preço original, preço com desconto, desconto calculado, link de afiliado, valor e
   percentual esperado de comissão, imagem principal, evidência de vendas e instante da coleta.
2. **Given** que somente o percentual ou somente o valor da comissão é exibido, **When** o outro
   dado pode ser calculado de forma inequívoca, **Then** o pacote contém ambos e identifica qual
   valor foi derivado.
3. **Given** que um campo obrigatório está ausente, inconsistente ou mudou antes da finalização,
   **When** o produto é revalidado, **Then** ele não gera pacote parcial e o próximo candidato
   elegível é considerado.
4. **Given** um link de afiliado gerado, **When** seu destino é validado, **Then** ele conduz ao
   mesmo produto e à mesma variação representados pelos demais dados do pacote.

### Edge Cases

- A sessão do perfil expira antes ou durante a pesquisa.
- A origem carrega somente parte dos resultados, repete produtos entre páginas ou altera a ordem
  durante a execução.
- Não há ofertas dentro das faixas configuradas de baixo e médio ticket.
- O preço promocional é igual ou superior ao preço original, ou o desconto exibido diverge do
  desconto calculado.
- O produto possui variações com preços, imagens, disponibilidade ou comissão diferentes.
- O produto fica indisponível ou muda de preço entre a qualificação e a seleção final.
- Há empate em vendas, desconto e comissão entre dois ou mais candidatos.
- A origem apresenta apenas um selo ou posição de popularidade, sem quantidade numérica de vendas.
- A origem não apresenta indicador de vendas comparável para nenhum candidato.
- O valor e o percentual de comissão exibidos divergem além do arredondamento monetário esperado.
- O link de afiliado não pode ser gerado, está inválido ou conduz a outro produto ou variação.
- A imagem principal está ausente, inacessível ou não corresponde à variação selecionada.
- Valores monetários usam separadores, moeda ou arredondamento diferentes dos esperados pela
  política configurada.
- Uma interrupção deixa a pesquisa incompleta antes que todo o escopo seja analisado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A rotina MUST exigir uma política de qualificação válida antes da pesquisa, contendo
  moeda, limites inclusivos e não sobrepostos para baixo e médio ticket e percentual mínimo de
  desconto atrativo.
- **FR-002**: A rotina MUST pesquisar somente com uma sessão autorizada do perfil de afiliado e
  MUST encerrar sem seleção quando a autorização estiver ausente ou expirada.
- **FR-003**: A rotina MUST analisar todas as ofertas únicas disponíveis no escopo de pesquisa
  configurado, incluindo todas as páginas de resultados, antes de declarar a pesquisa completa.
- **FR-004**: A rotina MUST identificar ofertas repetidas pelo produto e variação correspondentes,
  evitando avaliá-las mais de uma vez na mesma execução.
- **FR-005**: Para cada oferta avaliada, a rotina MUST registrar o instante da coleta e a evidência
  de origem usada na decisão.
- **FR-006**: Uma oferta MUST ser qualificada somente quando estiver elegível para afiliados,
  disponível para compra, dentro de uma das faixas de ticket, com preço promocional inferior ao
  original, desconto igual ou superior ao mínimo configurado, indicador comparável de vendas,
  comissão positiva, título não vazio, imagem principal acessível e link de afiliado válido.
- **FR-007**: A rotina MUST normalizar preço original e preço com desconto na moeda da política e
  MUST calcular valor e percentual de desconto sem substituir os valores observados na origem.
- **FR-008**: A rotina MUST rejeitar a oferta quando preço ou desconto exibido e calculado forem
  incompatíveis além do arredondamento da moeda.
- **FR-009**: A rotina MUST usar somente evidência de vendas fornecida pela Central de Afiliados,
  priorizando quantidade numérica, posição explícita em ranking e, por último, ordem estável em uma
  lista identificada como mais vendida; avaliações ou texto promocional não podem substituir essa
  evidência.
- **FR-010**: A rotina MUST capturar o valor esperado e o percentual de comissão exibidos; quando
  apenas um estiver disponível, MUST derivar o outro a partir do preço com desconto e marcar o
  campo derivado.
- **FR-011**: A rotina MUST rejeitar a oferta quando valor e percentual de comissão forem ausentes
  ou inconsistentes além do arredondamento monetário.
- **FR-012**: A rotina MUST gerar o link de compartilhamento associado ao perfil autorizado e MUST
  validar que o destino corresponde ao produto e à variação avaliados.
- **FR-013**: Título, preços, comissão, imagem, disponibilidade e link MUST representar o mesmo
  produto e a mesma variação.
- **FR-014**: Depois da qualificação, a rotina MUST ordenar candidatos pelo indicador comparável de
  vendas e MUST selecionar exatamente um candidato com a posição mais alta.
- **FR-015**: Empates MUST ser resolvidos, nesta ordem, pelo maior percentual de desconto, maior
  valor esperado de comissão e ordem estável apresentada pela origem.
- **FR-016**: A rotina MUST produzir no máximo um produto selecionado por execução e MUST produzir
  nenhum quando a pesquisa estiver incompleta ou não houver candidato totalmente qualificado.
- **FR-017**: Imediatamente antes da finalização, a rotina MUST revalidar disponibilidade, preços,
  elegibilidade, comissão, imagem e destino do link do candidato selecionado.
- **FR-018**: Se o primeiro candidato falhar na revalidação, a rotina MUST registrar o motivo e
  considerar o próximo candidato segundo a mesma ordenação, sem relaxar critérios.
- **FR-019**: O pacote final MUST conter identificador do produto e da variação, título, faixa de
  ticket, preço original, preço com desconto, valor e percentual de desconto, link de afiliado,
  valor e percentual esperado de comissão, imagem principal, evidência de vendas, justificativa da
  seleção e instante da última validação.
- **FR-020**: A rotina MUST NOT produzir pacote final parcial; a ausência ou invalidade de qualquer
  campo obrigatório MUST reprovar o candidato.
- **FR-021**: A execução MUST registrar status final, duração, quantidades pesquisada, qualificada,
  rejeitada e selecionada, além de um motivo verificável para cada rejeição e para a ausência de
  seleção.
- **FR-022**: Com a mesma política e o mesmo retrato de ofertas, execuções repetidas MUST produzir a
  mesma classificação, desempate e seleção.
- **FR-023**: Saídas e registros MUST NOT expor credenciais, cookies, dados de sessão ou parâmetros
  secretos do perfil de afiliado.
- **FR-024**: Esta feature MUST encerrar seu escopo ao entregar o pacote do produto selecionado;
  geração de texto ou imagem promocional, agendamento e publicação no Telegram ficam fora do
  escopo.

### Key Entities *(include if feature involves data)*

- **Política de Qualificação**: Regras vigentes de moeda, faixas de ticket, desconto mínimo e
  escopo da pesquisa usadas de forma uniforme em uma execução.
- **Execução de Pesquisa**: Uma tentativa rastreável, com política aplicada, início, término,
  status, contagens, falhas e relação com as decisões de qualificação.
- **Oferta Avaliada**: Retrato de um produto e variação na origem, incluindo preços, desconto,
  disponibilidade, elegibilidade, popularidade, comissão, título, imagem e resultado da avaliação.
- **Decisão de Qualificação**: Resultado aceito ou rejeitado de uma oferta, critérios observados,
  motivos e evidências que permitem revisar a decisão.
- **Produto Selecionado**: Pacote completo e revalidado do único candidato escolhido, incluindo
  dados comerciais, link de afiliado, imagem, evidência de vendas e justificativa de seleção.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em um conjunto de validação com ao menos 50 ofertas e resultados esperados conhecidos,
  100% das ofertas são qualificadas ou rejeitadas de acordo com a política, com motivo correto para
  cada rejeição.
- **SC-002**: Em 100% dos cenários de teste com ao menos um candidato comparável, a execução retorna
  exatamente um dos produtos mais vendidos segundo a ordenação e os desempates definidos; quando
  não há candidato válido, retorna nenhum.
- **SC-003**: 100% dos pacotes finais contêm todos os campos obrigatórios, representam o mesmo
  produto e variação e reproduzem os valores observados ou identificam explicitamente os valores
  derivados.
- **SC-004**: Nenhum cenário com pesquisa incompleta, sessão inválida, link incorreto ou campo
  obrigatório ausente resulta em produto selecionado.
- **SC-005**: Pelo menos 95% das pesquisas com até 200 ofertas visíveis no escopo são concluídas em
  até 10 minutos, incluindo a revalidação final.
- **SC-006**: Dada a mesma política e o mesmo retrato de ofertas, 100% de execuções repetidas
  escolhem o mesmo produto.
- **SC-007**: Em uma revisão piloto de 20 execuções, o responsável consegue entender por que cada
  produto foi selecionado ou rejeitado em até 2 minutos por execução, sem precisar reconstruir a
  pesquisa manualmente.
- **SC-008**: Em 100% das verificações de segurança, nenhum registro ou pacote contém credenciais,
  cookies, dados de sessão ou outros segredos do perfil.

## Assumptions

- O perfil já participa do programa de afiliados e possui acesso autorizado à Central de
  Afiliados; cadastro, recuperação de conta e adesão ao programa ficam fora do escopo.
- O responsável fornecerá, antes da execução, os limites monetários de baixo e médio ticket e o
  desconto percentual mínimo considerado atrativo; esta feature não define esses valores de
  negócio.
- A moeda configurada será a mesma usada pelas ofertas no escopo pesquisado.
- Na ausência de um filtro adicional, o escopo inclui todas as ofertas acessíveis ao perfil na
  área de pesquisa escolhida.
- A expressão "mais vendido" se refere exclusivamente ao indicador ou ranking comparável exibido
  pela Central de Afiliados; a rotina não estima vendas a partir de avaliações ou popularidade
  externa.
- A qualificação por faixa de preço e atratividade ocorre antes da ordenação por vendas.
- A comissão esperada é calculada sobre o preço com desconto quando a origem fornece apenas o
  percentual, respeitando o arredondamento da moeda.
- A imagem principal é a imagem do produto ou da variação apresentada pela origem, sem edição ou
  geração de uma nova imagem nesta feature.
- A origem disponibiliza dados de oferta, evidência de vendas, condições de comissão e geração de
  link de afiliado permitidos para uso pelo perfil e conforme as políticas vigentes.
- Agendamento periódico, criação de conteúdo promocional e envio ao Telegram serão tratados em
  features posteriores que consumirão o pacote produzido por esta rotina.
