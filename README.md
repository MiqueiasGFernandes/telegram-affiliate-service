# Telegram Affiliate Service

Scheduler standalone em NestJS/TypeScript para validar categorias do Mercado Livre, avaliar ofertas elegíveis de afiliado e selecionar no máximo um produto por execução. O escopo atual termina na seleção: geração de texto/imagem promocional e publicação no Telegram ainda não fazem parte desta implementação.

## Arquitetura

O projeto é um monólito modular com o contexto `affiliate-research`, organizado em domínio, aplicação e infraestrutura. O domínio e os casos de uso dependem de portas; adapters implementam o acesso às APIs oficiais do Mercado Livre, evidências preenchidas manualmente na Central de Afiliados e armazenamento opcional. Não existe listener HTTP.

O vínculo e a elegibilidade de afiliado são evidências manuais exportadas para arquivo JSON, com validade máxima de uma hora. A rotina não automatiza login, navegação autenticada ou scraping da Central de Afiliados.

## Requisitos

- Node.js 24 ou superior e npm.
- Docker Engine e Docker Compose v2 apenas para `npm run test:e2e`.
- Credenciais OAuth de uma aplicação Mercado Livre autorizada para executar a integração.

## Instalação e configuração

```bash
npm ci
cp .env.example .env
```

Edite `.env` com categorias MLB folha, limites comerciais e credenciais. Configure `AFFILIATE_EVIDENCE_FILE` para um caminho absoluto fora do repositório contendo evidências geradas manualmente. Consulte o [contrato das variáveis de ambiente](specs/001-qualify-affiliate-products/contracts/environment.md) e o [quickstart](specs/001-qualify-affiliate-products/quickstart.md).

Cron e fuso são obrigatórios inclusive no modo `once`. `PERSISTENCE_ENABLED=false` é o padrão e não inicializa conexão PostgreSQL. Para habilitar persistência, defina `PERSISTENCE_ENABLED=true`, configure `DATABASE_URL` e aplique migrations antes da execução:

```bash
npm run migration:run
npm run migration:status
```

## Execução

```bash
npm run start:once
npm run start:scheduler
```

O modo `once` executa uma pesquisa e encerra. O modo `scheduled` mantém o processo residente e registra a expressão de `SCHEDULE_CRON` no fuso de `SCHEDULE_TIMEZONE`. Apenas uma execução pode ocorrer por vez dentro do processo; não há coordenação distribuída para múltiplas réplicas.

## Testes e qualidade

```bash
npm test
npm run test:architecture
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Os testes E2E iniciam um PostgreSQL isolado via Compose, executam migrations e removem container, rede e volume ao final. Integrações externas do Meli são testadas com fixtures; a suíte não usa OAuth real.

## Documentação da feature

- [Especificação](specs/001-qualify-affiliate-products/spec.md)
- [Plano técnico](specs/001-qualify-affiliate-products/plan.md)
- [Modelo de dados](specs/001-qualify-affiliate-products/data-model.md)
- [Contratos](specs/001-qualify-affiliate-products/contracts/)
