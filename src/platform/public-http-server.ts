import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createServer, type Server } from 'node:http';

const CALLBACK_PATH = '/oauth/mercado-livre/callback';
const HEALTH_PATH = '/health';

const callbackPage = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Autorização recebida</title>
  </head>
  <body>
    <main>
      <h1>Retorno recebido</h1>
      <p>Volte ao terminal e cole a URL completa exibida na barra de endereços.</p>
    </main>
  </body>
</html>`;

export interface PublicHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

function response(
  status: number,
  contentType: string,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): PublicHttpResponse {
  return {
    status,
    headers: { ...securityHeaders, 'Content-Type': contentType, ...headers },
    body,
  };
}

export function resolvePublicHttpResponse(
  method: string | undefined,
  requestUrl: string,
): PublicHttpResponse {
  if (method !== 'GET')
    return response(405, 'text/plain; charset=utf-8', 'Method Not Allowed', { Allow: 'GET' });
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  if (pathname === HEALTH_PATH)
    return response(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
  if (pathname === CALLBACK_PATH) return response(200, 'text/html; charset=utf-8', callbackPage);
  return response(404, 'text/plain; charset=utf-8', 'Not Found');
}

@Injectable()
export class PublicHttpServer implements OnApplicationShutdown {
  private server: Server | undefined;

  async listen(port: number): Promise<number> {
    if (this.server) throw new Error('Public HTTP server is already listening');
    const server = createServer((request, response) => {
      const resolved = resolvePublicHttpResponse(request.method, request.url ?? '/');
      response.writeHead(resolved.status, resolved.headers);
      response.end(resolved.body);
    });
    this.server = server;

    return new Promise<number>((resolve, reject) => {
      const handleError = (error: Error) => {
        this.server = undefined;
        reject(error);
      };
      server.once('error', handleError);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', handleError);
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Public HTTP server did not expose a TCP port'));
          return;
        }
        resolve(address.port);
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
