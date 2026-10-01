import { Ajv2020, type AnySchema } from 'ajv/dist/2020.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat('date-time', {
  type: 'string',
  validate: (value: string) =>
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    !Number.isNaN(Date.parse(value)),
});
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat('uri', (value: string) => {
  try {
    return new URL(value).protocol.length > 0;
  } catch {
    return false;
  }
});

export function validateJsonSchema(schema: AnySchema, value: unknown): readonly string[] {
  const validate = ajv.compile(schema);
  if (validate(value)) return [];
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
  );
}
