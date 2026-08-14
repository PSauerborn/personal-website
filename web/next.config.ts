import type { NextConfig } from 'next';

/**
 * apiOrigin reduces the browser-facing API base URL to the bare origin the CSP
 * `connect-src` directive needs.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is inlined into the client bundle by `next build`,
 * and this config is evaluated by that same build, so the origin the policy
 * allows and the origin the bundle calls are fixed together and cannot drift.
 * An unset or unparseable value yields an empty string, leaving the policy at
 * `'self'` alone rather than failing the build: a bundle built without the
 * variable has nowhere to call anyway.
 *
 * @returns the scheme-and-authority origin, or an empty string when the
 *   variable is unset or is not an absolute URL.
 */
function apiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    // Warned about rather than left silent: an unset value produces a bundle
    // whose browser code has no base URL to call *and* a policy whose
    // `connect-src` omits the API origin, so every browser-side request — the
    // comments thread and the contact form — is refused before it is made and
    // nothing appears in the network log to say why. There is no test that can
    // go red for this, because it is a property of the environment the build
    // ran in, so the build output is the only place to raise it.
    console.warn(
      '[next.config] NEXT_PUBLIC_API_BASE_URL is not set. Browser-side ' +
        'requests (blog comments, contact form) will make no request and the ' +
        "CSP connect-src will stay at 'self'. Set it in web/.env for local " +
        'development, or pass it as a --build-arg to the Docker build.',
    );
    return '';
  }

  try {
    return new URL(value).origin;
  } catch {
    console.warn(
      `[next.config] NEXT_PUBLIC_API_BASE_URL is not an absolute URL: ` +
        `${value}. The CSP connect-src will stay at 'self' and browser-side ` +
        'requests will be refused.',
    );
    return '';
  }
}

/**
 * contentSecurityPolicy builds the Content Security Policy applied to every
 * route.
 *
 * The application renders three surfaces built from data it does not author —
 * article markdown, anonymous comment bodies and spec documents. Each has its
 * own barrier (`rehype-sanitize` with no `rehype-raw`, plain-text comments,
 * `<pre>` spec text); this policy is the layer that still holds if one of them
 * regresses, and `frame-ancestors 'none'` additionally denies the clickjacking
 * overlay against the contact form.
 *
 * Two allowances are deliberate and documented by Next.js for the nonce-free
 * configuration (`content-security-policy.md`): `script-src 'unsafe-inline'`,
 * because the App Router streams its flight payload through inline scripts, and
 * `style-src 'unsafe-inline'`, because Next injects styles inline. The
 * alternative — a per-request nonce — requires a proxy and forces every route
 * to dynamic rendering, which is a larger change than the exposure warrants.
 * `'unsafe-eval'` is added in development only, where React uses `eval` to
 * reconstruct server error stacks; production never carries it.
 *
 * `connect-src` carries the API origin because the browser posts the contact
 * form and the comments composer straight to the API (REQ-1.7); omitting it
 * would break both surfaces at runtime with no test going red.
 *
 * @returns the policy as a single semicolon-joined directive string, ready to
 * use as the value of the `Content-Security-Policy` header.
 */
function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === 'development';
  const connectSources = ["'self'", apiOrigin()].filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Next.js application configuration.
 *
 * `output: 'standalone'` emits a self-contained server bundle under
 * `.next/standalone`, which the production Dockerfile copies into a slim
 * runtime image instead of shipping `node_modules`.
 */
const nextConfig: NextConfig = {
  output: 'standalone',

  /**
   * headers applies the security response headers to every route.
   *
   * @returns a single header rule matching all paths.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy(),
          },
          {
            // Stops a browser from re-interpreting an API-sourced response as
            // HTML or script on the strength of its bytes.
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
