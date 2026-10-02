# Pre-push Quality Gate Contract

## Purpose

Fornecer feedback local reproduzível antes de enviar commits, sem substituir os controles da CI e
sem alterar comportamento, configuração ou dados da aplicação.

## Installation Contract

- O gerenciador é npm e `package-lock.json` permanece a fonte reprodutível das dependências.
- `husky@9.1.7` é uma `devDependency`.
- O script `prepare` executa `.husky/install.mjs`.
- O instalador sai com sucesso sem importar Husky quando `CI=true` ou `NODE_ENV=production`; em um
  checkout Git de desenvolvimento, ele ativa o diretório de hooks do Husky.
- O hook moderno não inclui `husky.sh` nem configuração de versões antigas.

## Command Contract

`package.json` expõe `check:pre-push` e executa, em ordem, parando no primeiro erro:

1. `npm run lint`
2. `npm run format:check`
3. `npm run typecheck`
4. `npm run test:architecture`
5. `npm run test:unit`
6. `npm run test:contract`
7. `npm run test:integration`
8. `npm run build`

`.husky/pre-push` é um script POSIX sem extensão que contém somente a delegação para
`npm run check:pre-push`. Argumentos nativos fornecidos pelo Git não são necessários e podem ser
ignorados. Exit code zero permite que o Git prossiga; qualquer código não zero é propagado e bloqueia
o push.

## Exclusions

O hook não:

- corrige ou reescreve arquivos;
- executa `test:e2e`, `test:performance`, smoke tests live ou Gitleaks;
- inicia Docker, PostgreSQL, rede ou a aplicação;
- contém credenciais, lê evidência afiliada ou exige variáveis do runtime;
- chama `--no-verify`, define `HUSKY=0` ou executa push/commit.

Essas exclusões mantêm o feedback local determinístico. `.github/workflows/ci.yml` continua sendo a
fonte final para suíte agregada, E2E com PostgreSQL e varredura de segredos.

## Validation Scenarios

### Successful development checkout

1. Em um checkout Git limpo com Node.js 24+, executar `npm ci`.
2. Confirmar que `git config --get core.hooksPath` aponta para o diretório interno do Husky.
3. Executar `npm run check:pre-push`.
4. Executar `.husky/pre-push` diretamente, sem realizar push.

Resultado esperado: as oito verificações passam na ordem definida e ambos os comandos retornam zero.

### Controlled failure propagation

1. Criar um diretório temporário fora do repositório contendo um executável `npm` substituto que
   termine com um código não zero conhecido.
2. Preceder temporariamente esse diretório ao `PATH` somente ao executar `.husky/pre-push`.
3. Remover o diretório temporário após o teste.

Resultado esperado: o hook devolve o mesmo código não zero, não executa push e não modifica arquivos
do repositório.

### CI and production installation

Executar o instalador com `CI=true` e com `NODE_ENV=production`.

Resultado esperado: ambas as execuções terminam com zero sem tentar importar ou instalar Husky.
