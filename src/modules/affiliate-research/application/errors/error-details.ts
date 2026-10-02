const sensitiveEnvKey = /token|secret|password|authorization|database_url|cookie/i;

function redactMessage(message: string, env: NodeJS.ProcessEnv): string {
  let safe = message.replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');
  const secretValues = Object.entries(env)
    .filter(([key, value]) => sensitiveEnvKey.test(key) && value && value.length >= 4)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
  for (const value of secretValues) safe = safe.split(value).join('[REDACTED]');
  safe = safe
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /(refresh_token|access_token|client_secret|password|authorization)=?[^\s&]*/gi,
      '$1=[REDACTED]',
    );
  return safe.slice(0, 500);
}

/** Returns diagnostic error metadata without logging stacks, URLs, or configured secrets. */
export function errorDetails(error: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (!(error instanceof Error))
    return { errorName: 'UnknownError', errorMessage: redactMessage(String(error), env) };

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return {
    errorName: error.name || 'Error',
    errorMessage: redactMessage(error.message, env),
    ...(code ? { errorCode: code } : {}),
  };
}
