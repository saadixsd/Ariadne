# Security

## Reporting

Please report security issues privately, through GitHub's **Security → Report a
vulnerability** on this repository, rather than in a public issue.

## How Ariadne protects accounts and data

| Area | What is in place | Code |
|---|---|---|
| Passwords | PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, constant-time compare | `lib/password.ts` |
| Sessions | 32-byte random token. Only its SHA-256 is stored. Cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, 30 days. Sign-out deletes the session row | `lib/auth.ts` |
| Authorization | every project/task query includes the signed-in `userId`, so someone else's id returns 404 | `lib/project.ts`, `app/api/**` |
| Cross-site requests | API writes (POST/PATCH/DELETE) whose `Origin` names another site, or that the browser marks `Sec-Fetch-Site: cross-site`, are refused with 403 before any route runs. This sits on top of the `SameSite=Lax` cookie and also covers sign-in | `proxy.ts` |
| Response headers | `Strict-Transport-Security` (1 year, subdomains), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and `frame-ancestors 'none'` (no clickjacking), `Permissions-Policy` turning off camera, microphone, geolocation and payment. No `X-Powered-By` | `next.config.ts` |
| Abuse limits | per-IP limits on sign-up (5/h), sign-in (10/h) and verify (20/h), stored in D1 with atomic counters | `lib/rate-limit.ts` |
| Cost limits | 10 model runs per account per UTC day, reserved before any provider call, plus a site-wide ceiling of 200 runs per UTC day across all accounts. Output is capped per call (8,192 tokens on Claude, 16,384 on GPT) | `lib/usage.ts`, `lib/limits.ts`, `lib/agents.ts` |
| Input | server-side length caps on every field. JSON bodies are type-checked | `lib/limits.ts`, `lib/input-caps.ts` |
| Model output | Markdown rendered without raw HTML, links limited to http(s)/mailto with `noopener noreferrer`, images not fetched. Generated HTML pages shown in a `sandbox=""` iframe | `components/MarkdownBody.tsx`, `components/OutputView.tsx` |
| Secrets | provider keys are Worker secrets, read only on the server. Provider error text is scrubbed of `sk-…` keys before it is stored or shown | `lib/agents.ts`, `lib/errors.ts` |
| Outbound | `global_fetch_strictly_public`: the Worker cannot fetch private addresses | `wrangler.jsonc` |
| Environments | branch previews no longer receive the production database binding (`wrangler.jsonc` has no `previews` block), so only `main` can reach production data | `wrangler.jsonc` |
| Repository | `.env*` (except `.env.example`), `.dev.vars`, local SQLite files and backups, and build output are git-ignored. A gitleaks scan of the full history finds no secrets | `.gitignore` |

## Known limitations

- Email verification is built but switched off (it needs Cloudflare Email Service on
  Workers Paid), so new accounts are active straight away. The per-account and
  site-wide run caps bound what an automated sign-up wave can spend.
- No CAPTCHA on sign-up yet.
- No password reset and no account deletion yet.
- PBKDF2 at 100k iterations is below today's OWASP guidance (600k). It's kept there
  because of the Workers free-plan CPU limit, and will be raised when the plan changes.
- No full Content-Security-Policy yet (only `frame-ancestors`); a script policy needs
  nonces for Next.js's inline scripts.
- Dependency audit: the remaining `npm audit` findings are in build-time tooling
  (`eslint-config-next` → `fast-glob` → `braces`, and the `prisma` CLI →
  `deepmerge-ts`), not in the deployed Worker. They need major-version upgrades.
