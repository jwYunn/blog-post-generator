/**
 * Environment variables the app refuses to start without.
 *
 * Anything listed here is guaranteed to be present by the time providers are
 * instantiated, so call sites can read it with `ConfigService.getOrThrow`
 * instead of carrying a fallback.
 */
const REQUIRED_ENV_VARS = ['TISTORY_BLOG_NAME'] as const;

/** Runs during ConfigModule bootstrap; throwing here aborts startup */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
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
