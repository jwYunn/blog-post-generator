/**
 * Environment variables the app refuses to start without.
 *
 * Anything required here is guaranteed to be present by the time providers are
 * instantiated, so call sites can read it with `ConfigService.getOrThrow`
 * instead of carrying a fallback.
 */
const ALWAYS_REQUIRED = ['TISTORY_BLOG_NAME'] as const;

/** Reads an env var as a boolean; only an explicit "true" enables a flag */
export function isEnabled(value: unknown): boolean {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/** Runs during ConfigModule bootstrap; throwing here aborts startup */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required: string[] = [...ALWAYS_REQUIRED];

  // The remote browser endpoint goes unread when the publish flow is told to
  // launch a browser on this machine instead
  if (!isEnabled(config.BROWSER_DEBUG_LOCAL)) {
    required.push('BROWSERLESS_URL');
  }

  const missing = required.filter((key) => {
    const value = config[key];
    return value === undefined || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return config;
}
