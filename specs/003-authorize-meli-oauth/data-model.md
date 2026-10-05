# Data Model: Autorização inicial do Mercado Livre

## AuthorizationAttempt

Representa uma tentativa efêmera e de uso único.

| Field | Type | Rules |
|-------|------|-------|
| `state` | string | Aleatório criptograficamente, não vazio, nunca persistido depois do processo |
| `codeVerifier` | string | Valor PKCE aleatório conforme caracteres permitidos e comprimento seguro |
| `codeChallenge` | string | SHA-256 do verifier em Base64 URL-safe, sem padding |
| `authorizationUrl` | URL | HTTPS, host oficial brasileiro, inclui client id, redirect URI, state e PKCE |
| `redirectUri` | URL | HTTPS e exatamente igual ao valor configurado |

### Lifecycle

```text
CREATED -> WAITING_FOR_CALLBACK -> EXCHANGING_CODE -> STORED
   |                 |                    |
   +---------------> FAILED <-------------+
```

Qualquer falha encerra a tentativa. Código, verifier e state não são reutilizados.

## AuthorizationCallback

Representa a URL devolvida pelo provedor e colada pelo operador.

| Field | Type | Rules |
|-------|------|-------|
| `callbackUrl` | URL | Deve corresponder à URI de retorno configurada |
| `code` | string | Obrigatório em sucesso; efêmero; nunca registrado |
| `state` | string | Obrigatório e igual ao state da tentativa |
| `error` | string optional | Se presente, a troca não ocorre |

## TokenExchangeResult

Resultado sensível recebido do endpoint oficial.

| Field | Type | Rules |
|-------|------|-------|
| `refreshToken` | string | Obrigatório, uma linha, não vazio; persistido sem ser exibido |

O access token e outros campos da resposta não são necessários ao bootstrap e não são mantidos.

## LocalEnvironment

Representa as linhas do `.env` preservadas textualmente.

| Field | Type | Rules |
|-------|------|-------|
| `content` | text | Preservado, exceto pela entrada alvo |
| `MELI_REFRESH_TOKEN` | string | Exatamente uma entrada ativa após sucesso |
| `mode` | filesystem permission | `0600` quando suportado |

### Persistence transition

```text
ABSENT or EXISTING -> TEMPORARY_COMPLETE -> ATOMICALLY_REPLACED
```

Se qualquer etapa anterior ao rename falhar, o arquivo existente continua intacto.
