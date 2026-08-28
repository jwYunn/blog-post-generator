import { Logger } from '@nestjs/common';

/**
 * Pull a JSON payload out of a model response.
 *
 * Every prompt in this project asks for JSON and nothing else, and the models
 * mostly comply - but "mostly" is the problem. The same response comes back
 * wrapped in a markdown fence one day and bare the next, sometimes with a line
 * of prose in front of it, and a run that fails on that has burned an API call
 * and a queue job for a formatting difference nobody chose.
 *
 * Each service used to carry its own version of this, which is how the outline
 * service ended up with none at all: it parsed the raw text and failed outright
 * on the first fenced response.
 */

/** Longest raw response worth carrying in an error message */
const PREVIEW_LIMIT = 200;

/** Remove a markdown code fence wrapping the whole response */
function stripCodeFence(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
}

/**
 * Take everything between the first bracket and the last matching one, which is
 * what rescues a payload with prose around it.
 */
function extractBracketed(raw: string): string | null {
  const start = raw.search(/[[{]/);
  if (start === -1) return null;

  const closer = raw[start] === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  return end > start ? raw.slice(start, end + 1) : null;
}

/** A single line of the response, for an error someone reads in the UI */
function preview(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return '(empty response)';
  return collapsed.length > PREVIEW_LIMIT
    ? `${collapsed.slice(0, PREVIEW_LIMIT)}...`
    : collapsed;
}

/**
 * @param source names the call in the error, so a failure says which model
 *   response could not be read rather than only that one could not
 * @param logger receives the untruncated response, which is the thing actually
 *   worth having when a prompt starts drifting
 */
export function parseJsonResponse<T>(
  raw: string,
  source: string,
  logger?: Logger,
): T {
  for (const candidate of [stripCodeFence(raw), extractBracketed(raw)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Fall through to the next way of reading it
    }
  }

  logger?.error(`Failed to parse the ${source} response. Raw response:`);
  logger?.error(raw);
  throw new Error(`Invalid JSON from ${source}: ${preview(raw)}`);
}

/** The first [ to the last ], for a list buried in something larger */
function extractArray(raw: string): string | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  return start !== -1 && end > start ? raw.slice(start, end + 1) : null;
}

/**
 * As parseJsonResponse, but for the calls that are only ever handed a list.
 * Valid JSON of the wrong shape fails here rather than several frames later on
 * a map over something that is not an array.
 */
export function parseJsonArrayResponse<T>(
  raw: string,
  source: string,
  logger?: Logger,
): T[] {
  const parsed = parseJsonResponse<unknown>(raw, source, logger);
  if (Array.isArray(parsed)) return parsed as T[];

  // A model asked for a list sometimes hands back an object with the list
  // inside it. The list is right there, so take it rather than failing a run
  // that already paid for the call.
  const bracketed = extractArray(raw);
  if (bracketed) {
    try {
      const retry: unknown = JSON.parse(bracketed);
      if (Array.isArray(retry)) return retry as T[];
    } catch {
      // Nothing usable; report the shape that was actually returned
    }
  }

  throw new Error(
    `Expected an array from ${source}, got ${typeof parsed}: ${preview(raw)}`,
  );
}
