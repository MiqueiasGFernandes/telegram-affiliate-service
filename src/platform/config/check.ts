import { parseEnvironment } from './environment-config.js';

try {
  const config = parseEnvironment(process.env);
  process.stdout.write(
    `${JSON.stringify({ valid: true, executionMode: config.executionMode, persistenceEnabled: config.persistenceEnabled })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ valid: false, message: error instanceof Error ? error.message : 'Invalid configuration' })}\n`,
  );
  process.exitCode = 1;
}
