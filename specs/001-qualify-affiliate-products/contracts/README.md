# Contracts: Pesquisa e Seleção de Produtos Afiliados

Esta aplicação não expõe HTTP, REST, GraphQL ou OpenAPI. Seus contratos são operacionais, de
entrada/saída da rotina e de integração externa:

- [environment.md](./environment.md): configuração validada do processo e regras condicionais.
- [e2e-compose.md](./e2e-compose.md): topologia e ciclo de vida das dependências Docker Compose.
- [mercado-livre-gateway.md](./mercado-livre-gateway.md): porta de consumo das APIs oficiais.
- [pre-push.md](./pre-push.md): contrato do gate de qualidade local executado antes do push.
- [affiliate-evidence.schema.json](./affiliate-evidence.schema.json): entrada manual ou autorizada
  para elegibilidade, comissão e link.
- [selected-product.schema.json](./selected-product.schema.json): pacote interno entregue às
  próximas etapas da mesma rotina.
- [run-summary.schema.json](./run-summary.schema.json): evento terminal estruturado de cada
  execução.

Schemas JSON usam JSON Schema Draft 2020-12. Valores monetários e percentuais são strings decimais
para preservar exatidão. Datas são instantes RFC 3339 em UTC. Os contratos não autorizam scraping
ou uso de endpoints internos.
