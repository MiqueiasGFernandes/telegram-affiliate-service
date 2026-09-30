# Mercado Livre Gateway Contract

Esta porta isola o domínio das APIs públicas do Mercado Livre. Ela é outbound-only e não cria um
servidor HTTP na aplicação.

## Operations

### `listBestSellerCandidates(categoryId, limit)`

Obtém posições oficiais de mais vendidos para `MLB` e retorna no máximo o limite configurado.

Output por candidato:

- tipo oficial da referência;
- identificador oficial;
- categoria;
- posição de ranking positiva;
- instante da observação.

Somente tipos que possam ser resolvidos por um caminho público documentado seguem para a próxima
etapa. Tipos desconhecidos ou não resolvíveis geram rejeição explícita; nunca acionam scraping.

### `getItems(references)`

Resolve metadados em lote pela operação oficial atual, preservando a associação por referência.

Output normalizado:

- produto e variação;
- título;
- categoria e condição;
- status/disponibilidade;
- vendedor necessário para a política;
- URL da imagem principal;
- URL pública individual do produto.

Uma resposta parcial permanece parcial: o gateway não inventa item nem reaproveita posição de
outro candidato.

### `getSalePrice(itemReference)`

Obtém preço vigente e preço regular pela operação oficial de preços.

Output:

- moeda;
- `amount` vigente;
- `regularAmount` original;
- instante da observação.

Campos legados de preço do detalhe do item não substituem esta operação quando estiverem
descontinuados ou divergentes.

### `getSellerReputation(sellerId)`

Obtém somente os atributos de reputação necessários à política. Dados pessoais do vendedor não
entram no domínio nem são persistidos.

## Authentication

- OAuth 2.0 oficial com refresh token rotativo.
- Credenciais fornecidas pelo mecanismo de segredos, nunca por tabela de negócio.
- Falha de refresh encerra a execução com `AUTHENTICATION_FAILED`.
- O gateway não automatiza senha, MFA, CAPTCHA, cookies ou sessão de navegador.

## Resilience

- Todas as operações têm timeout explícito.
- Concorrência nunca excede `MELI_MAX_CONCURRENCY`.
- `429` respeita `Retry-After`.
- Retry com backoff exponencial e jitter aplica-se somente a timeout, falha de transporte e status
  transitório documentado.
- Erros de autenticação, autorização, contrato, validação e item inexistente não recebem retry
  cego.
- Se alguma página/lote necessário não for obtido, a pesquisa recebe status incompleto e não pode
  gerar seleção.

## Data Provenance

Cada valor normalizado mantém operação de origem, identificador do item e instante da coleta. Raw
payload pode existir apenas em memória para mapeamento e não é persistido ou registrado. Fixtures
de contrato devem ser mínimas, sanitizadas e versionadas.

## Explicitly Unsupported

- leitura automatizada da Central de Afiliados;
- endpoints internos descobertos por browser/devtools;
- scraping, Playwright, Selenium ou interceptação de tráfego;
- inferir comissão do afiliado a partir de custo/taxa do vendedor;
- usar tendências, avaliações ou texto promocional como substituto de ranking de vendas;
- gerar link para busca, categoria ou ranking em vez da página individual do produto.

Elegibilidade, percentual e link são fornecidos separadamente pelo contrato de evidência afiliada.
