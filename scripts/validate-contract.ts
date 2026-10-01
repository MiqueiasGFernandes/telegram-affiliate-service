import { readFile } from 'node:fs/promises';
import type { AnySchema } from 'ajv';
import { validateJsonSchema } from '../src/platform/contract/json-schema-validator.js';

const [schemaPath, dataPath] = process.argv.slice(2);
if (!schemaPath || !dataPath)
  throw new Error('Usage: npm run contract:validate -- <schema.json> <data.json>');
const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as AnySchema;
const value: unknown = JSON.parse(await readFile(dataPath, 'utf8'));
const errors = validateJsonSchema(schema, value);
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Contract is valid.\n');
}
