import { describe, expect, it } from 'vitest';

import { siteConfig } from '@/lib/siteConfig';

/**
 * The confirmed personal details. These are real values and are asserted
 * literally: if any of them ever changes, the change should be deliberate.
 */
const NAME = 'Pascal Sauerborn';
const EMAIL = 'pascal.sauerborn@gmail.com';
const PHONE = '+ 1 (512) 271 8087';
const GITHUB_URL = 'https://github.com/PSauerborn';
const HEADLINE =
  'I make agentic development production-grade — designing spec-driven ' +
  'pipelines where AI subagents plan, implement, and review software with ' +
  'the rigor of 7+ years building platforms trusted with health records, ' +
  'genomic data, and critical infrastructure.';

describe('siteConfig', () => {
  it('carries the confirmed name and email verbatim', () => {
    expect(siteConfig.name).toBe(NAME);
    expect(siteConfig.email).toBe(EMAIL);
  });

  it('carries the supplied phone number verbatim', () => {
    expect(siteConfig.phone).toBe(PHONE);
  });

  it('carries the confirmed headline verbatim', () => {
    expect(siteConfig.headline).toBe(HEADLINE);
  });

  it('leaves the agents repository URL absent rather than guessed', () => {
    expect(siteConfig.agentsRepositoryUrl).toBeNull();
  });

  it('holds no empty string field', () => {
    for (const value of Object.values(siteConfig)) {
      if (typeof value === 'string') {
        expect(value.trim()).not.toBe('');
      }
    }
  });

  it('carries the site owner GitHub profile as an absolute https URL', () => {
    expect(siteConfig.githubUrl).toBe(GITHUB_URL);
    expect(new URL(siteConfig.githubUrl).protocol).toBe('https:');
  });

  it('exposes no repository URL from the DES-001 mockup', () => {
    // The mockup's placeholder profile. The one real `github.com` value the
    // configuration may carry is `githubUrl`, asserted literally above.
    const serialised = JSON.stringify(siteConfig).replace(GITHUB_URL, '');
    expect(serialised).not.toContain('github.com');
  });

  it('navigates to the four application routes in order', () => {
    expect(siteConfig.navigation.map((entry) => entry.href)).toEqual([
      '/',
      '/blog',
      '/projects',
      '/agents',
    ]);
    for (const entry of siteConfig.navigation) {
      expect(entry.label.trim()).not.toBe('');
    }
  });

  it('is frozen, along with its navigation entries', () => {
    expect(Object.isFrozen(siteConfig)).toBe(true);
    expect(Object.isFrozen(siteConfig.navigation)).toBe(true);
    for (const entry of siteConfig.navigation) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });
});
