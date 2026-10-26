# 07_Security_Shield: 4-Layer 20-Point Checklist

Every new route, query, and client store must satisfy this list. Naming a control is not enough: the control has to be on the server path that actually handles the data.

## Layer 1 — Input and Injection

1. **SQL injection block.** Python uses SQLModel / SQLAlchemy parameterized queries. Do not build SQL by concatenating request input.
2. **XSS sanitization.** Sanitize untrusted strings before they are stored or returned. Encode on output. Keep a Content-Security-Policy on responses that serve HTML.
3. **CSRF protection.** State-changing browser requests use an anti-CSRF token and `SameSite=Strict` cookies.
4. **File validation.** Product images and other uploads are checked on the server for MIME type and size.
5. **SSRF block.** Server-side fetches use an origin allowlist. Block link-local addresses, cloud metadata hosts, and any URL the client supplies.

## Layer 2 — Authentication and Database

6. **BOLA / branch ownership.** Every invoice, product, and branch read checks `branch_id` / `user_id` against the authenticated session. A caller cannot read another branch by changing an id.
7. **Redis rate limiting.** Upstash Redis limits sensitive routes (catalog sync included) per caller per minute.
8. **Password hashing.** Passwords are stored only as Argon2id or bcrypt hashes.
9. **MFA.** Super Admin and other sensitive accounts require TOTP.
10. **Server RBAC.** Hiding a button is not authorization. Python `rbac.py` and the Next.js server route both check the role.
11. **Supabase RLS.** Row Level Security is enabled so a branch cannot read another branch's rows even if an API check is missed.

## Layer 3 — Secrets and Tokens

12. **256-bit JWT.** Signing keys are at least 256 bits of randomness. Access tokens expire quickly.
13. **Server-side API keys.** Supabase service role, SMS, and Upstash credentials live in server env (`.env` / `.env.local`), never in client bundles.
14. **HttpOnly cookies, empty token stores.** Session tokens belong in `HttpOnly` + `Secure` cookies. `localStorage` and Dexie must not contain access tokens, refresh tokens, passwords, or API keys. Dexie holds the product catalog and offline invoices only.
15. **Zero default credentials.** Database and service accounts do not keep vendor default usernames or passwords.

## Layer 4 — Production Hygiene

16. **Strict CORS.** The Python API allowlists the frontend origin. `*` is not a production setting.
17. **Webhook HMAC.** Payment and other inbound webhooks are accepted only after the HMAC signature matches.
18. **No production source maps.** `productionBrowserSourceMaps` is `false`.
19. **Sanitize logs.** Logs do not contain passwords, tokens, cookie values, or customer payment data.
20. **Dependency audit.** Run `npm audit` and `pip-audit` and patch known vulnerabilities before release.
