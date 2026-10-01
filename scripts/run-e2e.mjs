import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const project = `affiliate-e2e-${process.pid}-${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const base = ['compose', '-f', 'compose.e2e.yaml', '-p', project];
let exitCode = 0;
let composeStarted = false;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: options.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on('close', (code) =>
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }),
    );
  });
}

const envForCompose = { ...process.env, E2E_POSTGRES_PASSWORD: password };
const runCompose = (args, options = {}) =>
  run('docker', [...base, ...args], { ...options, env: envForCompose });

try {
  let result = await runCompose(['config', '-q']);
  if (result.code) throw new Error('COMPOSE_CONFIG_FAILED');
  result = await runCompose(['pull', 'postgres']);
  if (result.code) throw new Error('POSTGRES_PULL_FAILED');
  composeStarted = true;
  result = await runCompose(['up', '-d', '--wait', '--wait-timeout', '60', 'postgres']);
  if (result.code) throw new Error('POSTGRES_START_FAILED');
  result = await runCompose(['port', 'postgres', '5432'], { capture: true });
  if (result.code || !result.stdout) throw new Error('POSTGRES_PORT_UNAVAILABLE');
  const port = result.stdout.split(':').at(-1);
  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    EXECUTION_MODE: 'once',
    SCHEDULE_CRON: '0 0 * * *',
    SCHEDULE_TIMEZONE: 'UTC',
    PERSISTENCE_ENABLED: 'true',
    DATABASE_URL: `postgresql://affiliate_e2e:${password}@127.0.0.1:${port}/affiliate_e2e`,
    DATABASE_SSL: 'false',
  };
  result = await run('node', ['--import', 'tsx', 'scripts/run-migrations.ts'], { env: testEnv });
  if (result.code) throw new Error('MIGRATION_FAILED');
  result = await run('npx', ['vitest', 'run', 'test/e2e'], { env: testEnv });
  if (result.code) throw new Error('E2E_TEST_FAILED');
} catch (error) {
  exitCode = 1;
  process.stderr.write(
    `${JSON.stringify({ event: 'affiliate_research.e2e_failed', code: error instanceof Error ? error.message : 'UNKNOWN' })}\n`,
  );
  if (composeStarted) {
    await runCompose(['ps', '--all']);
    await runCompose(['logs', '--no-color', '--timestamps']);
  }
} finally {
  if (composeStarted) {
    const teardown = await runCompose(['down', '-v', '--remove-orphans']);
    if (teardown.code) exitCode = 1;
  }
}
process.exitCode = exitCode;
