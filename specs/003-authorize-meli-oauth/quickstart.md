# Quickstart: validar autorização inicial do Mercado Livre

## Prerequisites

- Node.js 24+ and project dependencies installed.
- Mercado Livre application configured for offline access.
- Exact HTTPS redirect URI registered in DevCenter.
- A local `.env` excluded from Git.

## Configure

Set these values in `.env` without committing the file:

```dotenv
MELI_CLIENT_ID=<your-app-id>
MELI_CLIENT_SECRET=<your-secret>
MELI_REDIRECT_URI=https://your-domain.example/oauth/mercado-livre/callback
```

## Automated validation

Run the focused tests, followed by all quality gates:

```bash
npm run test:unit -- mercado-livre-authorization
npm run test:integration -- mercado-livre-authorization
npm run lint
npm run format:check
npm run typecheck
npm run test:architecture
npm run build
```

Expected: all commands pass without network access or real credentials.

## Manual authorization

```bash
npm run meli:authorize
```

1. Open the displayed Mercado Livre URL in a browser.
2. Sign in with the account owner and approve access.
3. Copy the complete final URL from the browser address bar.
4. Paste it into the command prompt.

Expected:

- The command reports success without displaying any token.
- `.env` contains one active `MELI_REFRESH_TOKEN` entry.
- Other `.env` entries are unchanged.
- `.env` has owner-only permissions on compatible systems.

Do not run the live flow in automated tests. The service still needs a separate durable mechanism to persist every refresh token returned by later runtime rotations.
