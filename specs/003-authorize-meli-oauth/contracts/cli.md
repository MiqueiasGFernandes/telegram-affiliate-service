# CLI Contract: `npm run meli:authorize`

## Purpose

Obter e armazenar o primeiro `MELI_REFRESH_TOKEN` sem construir manualmente as requisições OAuth e sem revelar o token.

## Required configuration

O comando resolve os valores do ambiente do processo e, como conveniência local, do arquivo `.env`:

| Name | Sensitive | Description |
|------|-----------|-------------|
| `MELI_CLIENT_ID` | No | Identificador do aplicativo |
| `MELI_CLIENT_SECRET` | Yes | Segredo do aplicativo |
| `MELI_REDIRECT_URI` | No | URI HTTPS cadastrada exatamente no DevCenter |
| `MELI_HTTP_TIMEOUT_MS` | No | Opcional; segue o limite já aceito pelo projeto |

O ambiente do processo prevalece sobre `.env`.

## Interactive flow

1. O comando valida a configuração sem imprimir valores sensíveis.
2. Exibe a URL oficial de autorização e pede ao operador para abri-la.
3. Solicita a URL completa para a qual o navegador foi redirecionado.
4. Valida URI, erro OAuth e state.
5. Troca o código e atualiza `.env`.
6. Exibe confirmação sem imprimir o token.

## Success output and exit

- Exit code: `0`
- Output confirms that `.env` was updated and lembra que a rotação em produção é uma responsabilidade separada.
- Output MUST NOT include client secret, authorization code, access token or refresh token.

## Failure output and exit

- Exit code: non-zero
- Categories: invalid configuration, invalid callback URL, denied consent, state mismatch, timeout, remote rejection, malformed token response, storage failure.
- Messages are fixed and actionable. Remote response bodies and sensitive URLs are not echoed.
- `.env` remains unchanged unless the entire exchange and atomic write succeed.

## Non-interactive invocation

If standard input or output is not attached to a terminal, the command fails before starting OAuth. This avoids hanging unattended jobs and accidental credential handling in CI.
