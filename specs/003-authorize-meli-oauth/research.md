# Research: Autorização inicial do Mercado Livre

## Fluxo OAuth

**Decision**: Usar Authorization Code server-side com `state` imprevisível. O operador abre a URL oficial e cola a URL completa de retorno no CLI; o comando valida o retorno e troca o código por tokens via `POST` form-encoded.

**Rationale**: O Mercado Livre exige consentimento do titular, `redirect_uri` idêntica à cadastrada e troca server-side com client secret. Validar `state` reduz risco de aceitar um retorno alheio. A documentação oficial orienta enviar as credenciais no corpo e guardar o refresh token retornado: [Autenticação e Autorização](https://developers.mercadolivre.com.br/pt_br/mensagens-post-venda/autenticacao-e-autorizacao).

**Alternatives considered**:

- Endpoint HTTPS permanente: rejeitado porque o serviço é outbound-only e a feature é um bootstrap local.
- Login automatizado ou captura de cookies: rejeitado por segurança, termos do provedor e necessidade de consentimento humano.
- Colar somente o código: rejeitado porque perderia a validação do `state` e da URI de retorno.

## PKCE

**Decision**: Gerar `code_verifier` e `code_challenge` S256 em toda tentativa e enviar o verifier na troca.

**Rationale**: O provedor documenta PKCE como opcional por configuração da aplicação e recomenda S256. Incluir PKCE protege o código de autorização sem substituir o client secret e não requer armazenamento duradouro.

**Alternatives considered**:

- PKCE desabilitado: menor complexidade, mas proteção inferior para o código temporário.
- Método `plain`: suportado, porém explicitamente não recomendado pelo provedor.

## Persistência local

**Decision**: Atualizar somente `MELI_REFRESH_TOKEN` em `.env`, preservando o restante, por gravação em arquivo temporário no mesmo diretório, `chmod 0600` e rename atômico.

**Rationale**: `.env` já é ignorado pelo repositório e é a fonte de configuração documentada. A troca atômica impede truncamento em falhas, e a permissão reduz exposição local. O valor nunca precisa passar pela saída do terminal.

**Alternatives considered**:

- Imprimir o token: rejeitado por exposição em scrollback e logs.
- Atualizar `.env.example`: rejeitado porque arquivos versionados não podem conter segredos.
- Banco de dados/secret manager: apropriado para rotação de produção, mas excessivo para o bootstrap local solicitado.

## Testabilidade e erros

**Decision**: Injetar interação, gateway e armazenamento no caso de uso; testar o contrato HTTP com `fetch` controlado e o arquivo em diretório temporário. Traduzir erros remotos para categorias fixas sem incluir payloads ou URLs.

**Rationale**: Garante cobertura determinística sem credenciais ou rede live e impede que mensagens arbitrárias do provedor carreguem segredos.

**Alternatives considered**:

- Mockar detalhes internos globais: rejeitado por acoplamento e baixa fidelidade.
- Testes contra o Mercado Livre: rejeitados pela constituição e pelo risco de usar credenciais reais.
