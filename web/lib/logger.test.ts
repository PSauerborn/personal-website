import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '@/lib/logger';

/**
 * Coverage for the server-side structured logger (`[LOG-001]` to `[LOG-006]`).
 *
 * The assertions that matter are the shape of a record — one JSON object per
 * line carrying `message`, `timestamp` and `level`, with context in dedicated
 * fields rather than interpolated into the message — and the `LOG_LEVEL`
 * envelope, which is the whole point of `[LOG-006]`: verbosity has to change
 * without a code change. The last block guards the other half of the contract,
 * that this module never reaches the browser.
 */

/** Console spy installed for the duration of each test. */
let written: string[];

/** Value of `LOG_LEVEL` before the suite touched it. */
const originalLevel = process.env.LOG_LEVEL;

beforeEach(() => {
  written = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    written.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLevel;
  }
});

/**
 * parseOnly parses the single record the logger is expected to have written.
 *
 * @returns the parsed record.
 */
function parseOnly(): Record<string, unknown> {
  expect(written).toHaveLength(1);
  return JSON.parse(written[0]) as Record<string, unknown>;
}

describe('log', () => {
  it('writes one JSON line carrying message, timestamp and level', () => {
    delete process.env.LOG_LEVEL;

    log('info', 'received request to get user');

    const record = parseOnly();
    expect(record.message).toBe('received request to get user');
    expect(record.level).toBe('info');
    expect(typeof record.timestamp).toBe('number');
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('places context in dedicated fields rather than in the message', () => {
    delete process.env.LOG_LEVEL;

    log('warn', 'spec document could not be read', {
      spec_id: 'SPEC-003',
      document_id: 'doc-acceptance-003',
    });

    const record = parseOnly();
    expect(record.message).toBe('spec document could not be read');
    expect(record.spec_id).toBe('SPEC-003');
    expect(record.document_id).toBe('doc-acceptance-003');
    expect(record.message).not.toContain('SPEC-003');
  });

  it('never lets a context field displace a required field', () => {
    delete process.env.LOG_LEVEL;

    log('error', 'the real message', {
      message: 'impostor',
      level: 'debug',
      timestamp: 0,
    });

    const record = parseOnly();
    expect(record.message).toBe('the real message');
    expect(record.level).toBe('error');
    expect(record.timestamp).not.toBe(0);
  });

  it('defaults to info, suppressing debug and admitting warn', () => {
    delete process.env.LOG_LEVEL;

    log('debug', 'suppressed');
    expect(written).toHaveLength(0);

    log('warn', 'admitted');
    expect(written).toHaveLength(1);
  });

  it('raises verbosity when LOG_LEVEL asks for it', () => {
    process.env.LOG_LEVEL = 'debug';

    log('debug', 'admitted at debug');

    expect(parseOnly().message).toBe('admitted at debug');
  });

  it('lowers verbosity when LOG_LEVEL asks for it', () => {
    process.env.LOG_LEVEL = 'error';

    log('info', 'suppressed at error');
    log('warn', 'also suppressed at error');
    expect(written).toHaveLength(0);

    log('error', 'admitted at error');
    expect(written).toHaveLength(1);
  });

  it('is case-insensitive about LOG_LEVEL and falls back on nonsense', () => {
    process.env.LOG_LEVEL = 'WARN';
    log('info', 'suppressed');
    expect(written).toHaveLength(0);

    process.env.LOG_LEVEL = 'chatty';
    log('info', 'admitted under the default');
    expect(written).toHaveLength(1);
  });

  it('falls back when LOG_LEVEL names an inherited Object.prototype key', () => {
    // `'constructor' in SEVERITY` is true — the `in` operator walks the
    // prototype chain — so a membership test written that way accepts
    // `constructor` as a level, `SEVERITY['constructor']` is a function, every
    // `severity < undefined` comparison is false and the process emits
    // everything. The level must fall back to the default exactly as any other
    // unrecognised value does.
    process.env.LOG_LEVEL = 'constructor';

    log('debug', 'suppressed under the default');
    expect(written).toHaveLength(0);

    log('info', 'admitted under the default');
    expect(written).toHaveLength(1);
  });

  it('reads LOG_LEVEL per call so a running server can be turned up', () => {
    process.env.LOG_LEVEL = 'error';
    log('info', 'suppressed');
    expect(written).toHaveLength(0);

    process.env.LOG_LEVEL = 'info';
    log('info', 'admitted');
    expect(written).toHaveLength(1);
  });
});

/**
 * sourceFiles lists every source file under the given directory, recursively.
 *
 * @param directory - absolute path of the directory to walk.
 * @returns the absolute paths of the files it contains.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('logger server boundary', () => {
  it('is never imported by a client component', () => {
    const roots = [
      resolve(import.meta.dirname, '../app'),
      resolve(import.meta.dirname, '../components'),
      resolve(import.meta.dirname, '.'),
    ];
    // Assembled rather than written out so this file does not match its own
    // source, and anchored to a quoted directive so prose about the client
    // boundary is not mistaken for a declaration of one.
    const directive = new RegExp(`(['"])use ${'client'}\\1`);

    const offenders = roots
      .flatMap(sourceFiles)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return directive.test(source) && source.includes('@/lib/logger');
      });

    expect(offenders).toEqual([]);
  });
});
