/**
 * Server-side structured logging (`[LOG-001]` to `[LOG-006]`).
 *
 * This module is **server-only**. It is imported by Server Components and by
 * server-side modules under `lib/`, and it must never be reached from a file
 * carrying the `'use client'` directive: everything a client component imports
 * is bundled and shipped to the browser, and a browser that writes these records
 * writes them to a console nobody collects. `lib/logger.test.ts` asserts the
 * boundary rather than trusting it.
 *
 * There is no logging package behind this file, by decision: the whole surface
 * the application needs is one levelled JSON line on stdout, `next build`
 * traces every dependency into the standalone bundle, and Next.js already
 * forwards server output to stdout, where the container log driver collects it.
 * A dependency would add weight to the image and a version to keep current in
 * exchange for transports and formatters this application does not use.
 * `[LOG-005]`'s file half is therefore served by the log driver, not by
 * application code writing a second copy inside the container.
 */

/** Severities this logger emits, from most to least verbose. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Arbitrary context attached to a record as dedicated fields (`[LOG-004]`). */
export type LogContext = Record<string, unknown>;

/**
 * Numeric severity of each level. A record is written when its severity is at
 * least that of the configured level.
 */
const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Level applied when `LOG_LEVEL` is unset or is not one of the four names. */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * activeLevel resolves the level the process is currently configured for.
 *
 * `LOG_LEVEL` is read on every call rather than once at module load, so the
 * verbosity of a running server follows the environment it is given without a
 * code change or a rebuild (`[LOG-006]`). An unrecognised value falls back to
 * the default rather than throwing: a typo in a deployment environment must not
 * be able to take the process down.
 *
 * Membership is tested with `Object.hasOwn` rather than the `in` operator: `in`
 * walks the prototype chain, so `LOG_LEVEL=constructor` would be accepted as a
 * level, `SEVERITY['constructor']` would be `Object` itself, and every
 * `severity < undefined` comparison would be false — the process would emit
 * every record including `debug`, which is the opposite of falling back.
 *
 * @returns the configured level, or `info` when none is configured.
 */
function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();

  return configured !== undefined && Object.hasOwn(SEVERITY, configured)
    ? (configured as LogLevel)
    : DEFAULT_LOG_LEVEL;
}

/**
 * log writes one structured record to stdout as a single line of JSON.
 *
 * Every record carries `message`, `timestamp` and `level` (`[LOG-002]`,
 * `[LOG-003]`). The timestamp is Unix epoch seconds. Context belongs in
 * `context` as dedicated fields and must not be interpolated into `message`
 * (`[LOG-004]`), so that records of the same event stay searchable as a group:
 * write `log('warn', 'spec document could not be read', { spec_id })`, not
 * `log('warn', \`could not read ${'${spec_id}'}\`)`.
 *
 * Context is spread before the three required fields, so a caller that happens
 * to pass a `message`, `timestamp` or `level` key cannot displace them. The
 * required fields therefore appear last in the emitted object; key order is not
 * significant in JSON, and a record that is missing a required field would be.
 *
 * Nothing that could carry personal data belongs in a record: no request body,
 * no contact-form payload, no comment body. Pass identifiers and reasons.
 *
 * @param level - severity of the record; records below the configured
 *   `LOG_LEVEL` are dropped.
 * @param message - fixed, human-readable description of the event. It should
 *   read the same on every occurrence so occurrences can be counted.
 * @param context - optional event-specific fields, merged into the record.
 * @returns nothing.
 */
export function log(
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void {
  if (SEVERITY[level] < SEVERITY[activeLevel()]) {
    return;
  }

  // console.log rather than a level-specific console method: Next.js forwards
  // it to stdout unchanged, which keeps every record on one stream in the order
  // it was written. The severity is in the record, not in the choice of stream.
  console.log(
    JSON.stringify({
      ...context,
      message,
      timestamp: Math.floor(Date.now() / 1000),
      level,
    }),
  );
}
