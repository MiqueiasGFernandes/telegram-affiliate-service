# Mercado Livre Gateway Contract

Esta porta isola o domínio das APIs públicas oficiais do Mercado Livre. Ela é outbound-only e não
cria um servidor HTTP na aplicação. O processo não lê nem automatiza a Central de Afiliados.

## Operations

### `discoverLeafCategories(limit)`

Obtém o dump oficial da árvore do site MLB, seleciona até dez categorias folha por
`total_items_in_this_category` decrescente e desempata por ID ascendente. O limite aceito é de 1 a
10. Catálogo ausente, malformado ou sem folhas válidas falha fechado; IDs não são fornecidos por
ENV.

### `validateLeafCategories(categoryIds)`

Valida em chamadas oficiais, antes de consultar qualquer ranking, de 1 a 10 IDs únicos descobertos
no dump. Todo ID deve existir em MLB e ser uma categoria folha. ID de outro site, inexistente ou
não folha falha na validação e impede a pesquisa.

### `getBestSellerRanking(categoryId)`

Consulta o ranking oficial da categoria validada e retorna todas as referências fornecidas pelo
Mercado Livre, até o máximo documentado de 20. O chamador não passa um limite que possa truncar a
resposta.

Resultado discriminado:

- `RANKING_AVAILABLE`: query data validada e lista completa de até 20 referências com tipo e
  identificador oficial. Quando a origem omite `position`, usar a ordem estável da lista, baseada
  no índice de 1 a 20, conforme FR-009. Posição explicitamente repetida ou resposta fora de ordem
  sem posição utilizável é erro contratual.
- `NO_RANKING`: somente para a resposta 404 documentada de ausência de ranking para uma categoria
  folha previamente validada (`Dimension CATEGORY with id ... not found`). A categoria conta como
  processada e gera zero referências.
- `UNAVAILABLE`: falha técnica ou contratual, como timeout, autenticação/autorização, rate limit
  após retries, resposta parcial/malformada, outro 404 ou outro erro. A categoria fica indisponível
  e a execução incompleta.

Uma lista vazia só é considerada processada quando a resposta satisfaz o contrato oficial. Resposta
inválida nunca é interpretada como ausência de ranking.

### `resolveRankedReferences(references)`

Resolve referências tipadas somente por operações oficiais documentadas compatíveis com o tipo:

- `ITEM`: detalhe individual ou `/items/bulk?ids=` para metadados.
- `PRODUCT`: `/products/{productId}` para metadados do catálogo; só segue como oferta quando uma
  publicação individual comprável correspondente puder ser identificada por operação oficial.
- `USER_PRODUCT`: `/user-products/{userProductId}` para dados do produto e operação oficial
  documentada para a condição de venda associada, quando disponível.

Se as operações documentadas não fornecerem dados comerciais atuais e publicação comprável, a
referência é rejeitada como não resolvível para esta execução. Nunca usar browser, endpoint não
documentado ou scraping. A implementação preserva `categoryId`, posição efetiva, posição declarada
quando houver, tipo e ID de origem ao associar metadados normalizados.

Saída normalizada por referência resolvida:

- identidade do produto e variação (`NO_VARIATION` quando não houver variação);
- título, categoria, condição e disponibilidade;
- vendedor apenas quando a política exigir atributo público de reputação;
- URL da imagem principal e URL pública individual do produto.

Uma referência oficial que não possa ser resolvida pelo contrato suportado é rejeitada com motivo
estável. Nunca aciona navegador, scraping ou endpoint interno. Resposta parcial é preservada como
falha explícita, sem inventar metadados ou reutilizar dados de outra referência.

### `getSalePrice(itemReference)`

Obtém preço vigente e preço regular pela operação oficial de preços. Retorna moeda, valores decimais
exatos e instante observado. Campos legados divergentes não substituem a operação atual.

### `getSellerReputation(sellerId)`

Obtém somente atributos públicos necessários à política. Dados pessoais do vendedor não entram no
domínio nem são persistidos.

## Authentication

- OAuth 2.0 oficial com refresh token rotativo.
- Credenciais fornecidas por mecanismo de segredos, nunca por tabela de negócio.
- Falha de refresh encerra a execução com `AUTHENTICATION_FAILED`.
- O gateway não automatiza senha, MFA, CAPTCHA, cookies ou sessão de navegador.

## Resilience and Completion

- Todas as operações têm timeout explícito e concorrência limitada.
- `429` respeita `Retry-After`; retries limitados com backoff/jitter aplicam-se apenas a falhas
  transitórias documentadas.
- Falha técnica em qualquer ranking de categoria selecionada marca a execução incompleta, sem
  produto selecionado.
- `NO_RANKING` para folha previamente validada é uma resposta de negócio completa, não falha.
- Cada ranking validado fornece no máximo 20 referências. Até dez categorias geram no máximo 200
  referências brutas; o sistema processa todas, sem limite de corte configurável.

## Data Provenance

Cada valor normalizado mantém operação de origem, identificador, categoria, posição e instante da
coleta. A mesma oferta que aparece em rankings diferentes recebe uma única avaliação comercial,
mantendo uma entrada de ranking separada por categoria. Payload bruto pode existir apenas em
memória para mapeamento e nunca é persistido ou registrado.

## Explicitly Unsupported

- leitura automatizada ou scraping da Central de Afiliados;
- endpoints internos descobertos por browser/devtools;
- Playwright, Selenium ou interceptação de tráfego;
- inferir comissão de afiliado a partir de custo/taxa do vendedor;
- usar tendências, avaliações ou texto promocional como substituto de ranking de vendas;
- link para busca, categoria ou ranking em vez da página individual do produto.

Elegibilidade, percentual e link são fornecidos por arquivo de evidências coletadas manualmente nas
ferramentas oficiais.
