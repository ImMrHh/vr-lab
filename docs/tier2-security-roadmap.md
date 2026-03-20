# Tier 2 Security Roadmap — Server-Validated PIN

Full implementation plan to move admin authentication from a client-side hardcoded PIN to a server-validated PIN with session tokens via the Cloudflare Worker.

---

## Stage 1 — Cloudflare Worker: Auth Endpoint
**Effort:** ~1 hour | **Risk:** Low | **Dependencies:** Cloudflare dashboard access

| Step | Task | Details |
|------|------|---------|
| 1.1 | **Store PIN as a Worker secret** | Run `wrangler secret put ADMIN_PIN` — this stores the PIN encrypted in Cloudflare's environment, never visible in source code |
| 1.2 | **Add `POST /auth` route** | New endpoint in the Worker that: accepts `{pin}` in the request body, compares against the secret, returns a session token if correct |
| 1.3 | **Generate session tokens** | On successful PIN match, generate a random token (e.g., `crypto.randomUUID()`) with a TTL (recommended: 8 hours = 1 school day) |
| 1.4 | **Store active sessions** | Use Cloudflare Workers KV (`VR_SESSIONS` namespace) to store `token → expiry` pairs |
| 1.5 | **Add rate limiting** | Track failed attempts by IP in KV — lock out after 5 failures for 15 minutes (prevents brute force) |

**Deliverable:** A working `/auth` endpoint that validates PINs server-side and issues tokens.

---

## Stage 2 — Cloudflare Worker: Protect Write Operations
**Effort:** ~1 hour | **Risk:** Low | **Dependencies:** Stage 1 complete

| Step | Task | Details |
|------|------|---------|
| 2.1 | **Require token on POST/PATCH** | Modify the Worker to check for an `Authorization: Bearer <token>` header on all write requests (create booking, cancel, block) |
| 2.2 | **Validate token against KV** | Look up the token in `VR_SESSIONS`, check it hasn't expired |
| 2.3 | **Return 401 for invalid/expired tokens** | Client receives a clear error so it can prompt re-authentication |
| 2.4 | **Leave GET requests unprotected** | Reading bookings (the calendar view) stays public — no token needed |
| 2.5 | **Add `POST /logout` route** | Deletes the token from KV, invalidates the session |

**Deliverable:** All write operations (booking, cancelling, blocking) are now gated behind a valid session token. Read-only calendar access remains open.

---

## Stage 3 — Frontend: Wire Up Token Flow
**Effort:** ~1–1.5 hours | **Risk:** Medium | **Dependencies:** Stages 1 & 2 deployed

| Step | Task | Details |
|------|------|---------|
| 3.1 | **Remove `ADMIN_PIN` from `app.js`** | Delete line 2 (`const ADMIN_PIN = '2026'`) — this is the main security win |
| 3.2 | **Update `pinPress()` to call `/auth`** | Instead of local comparison, send PIN to the Worker and await response |
| 3.3 | **Store token in `sessionStorage`** | On success, save the returned token — it persists for the browser tab lifetime but is lost on close |
| 3.4 | **Attach token to write requests** | Modify `proxyPost()` and `proxyPatch()` to include `Authorization: Bearer <token>` header |
| 3.5 | **Handle 401 responses** | If any write call returns 401: clear the stored token, set `isAdmin = false`, show a toast ("Sesión expirada — ingresa el PIN de nuevo"), and redirect to the PIN screen |
| 3.6 | **Update `exitAdmin()`** | Call `/logout` to invalidate the server-side token, then clear `sessionStorage` |
| 3.7 | **Auto-restore session on reload** | On page load, check `sessionStorage` for a token → validate it with a lightweight `GET /auth/check` endpoint → if valid, auto-enter admin mode |

**Deliverable:** The PIN is never in the client code. Authentication round-trips to the server. Expired sessions are handled gracefully.

---

## Stage 4 — Testing & Rollback Safety
**Effort:** ~30 min | **Risk:** Low | **Dependencies:** Stage 3 complete

| Step | Task | Details |
|------|------|---------|
| 4.1 | **Test happy path** | Enter correct PIN → get token → create booking → cancel booking → exit admin |
| 4.2 | **Test wrong PIN** | Enter wrong PIN 5 times → verify rate-limit lockout message |
| 4.3 | **Test expired session** | Wait for TTL or manually delete KV entry → confirm 401 handling and re-auth prompt |
| 4.4 | **Test read-only access** | Without admin, verify calendar loads and shows bookings normally |
| 4.5 | **Bump SW cache** | Increment `sw.js` cache name to `vr-lab-v3` so all users get the updated `app.js` |
| 4.6 | **Tag backup** | Create `backup/pre-tier2` branch before merging, so you can instant-rollback if needed |

**Deliverable:** Verified, tested, and deployed with a rollback branch ready.

---

## Summary Timeline

```
Stage 1 ──▶ Stage 2 ──▶ Stage 3 ──▶ Stage 4
 Worker      Worker      Frontend     Testing
 /auth       gate        wiring       & deploy
 (~1 hr)     (~1 hr)     (~1.5 hr)    (~30 min)
                                       ─────────
                                       ~4 hrs total
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cloudflare KV latency on token validation | Low | Low | KV reads are <10ms globally; negligible |
| Worker deployment breaks existing proxy | Medium | High | Test in a staging Worker first; keep the backup branch |
| Users have stale cached `app.js` with old PIN logic | Medium | Medium | SW cache bump (`v2` → `v3`) forces re-download on next visit |
| Rate limiting locks out real admin | Low | Medium | 5 attempts is generous; lockout is only 15 min; can be overridden via Cloudflare dashboard |
| Token stolen from `sessionStorage` | Very Low | Medium | `sessionStorage` is tab-scoped (not shared); 8-hour TTL limits exposure; school LAN environment further reduces risk |

## What Does NOT Change

- ✅ The PIN keypad UI stays the same (teachers see no difference)
- ✅ Calendar reading stays public / no login
- ✅ All existing bookings and Airtable data are unaffected
- ✅ Dark mode, stats, CSV export — everything else works identically

---

**Status:** 📌 Pinned — awaiting implementation approval.