# SplitEase Server

Backend for SplitEase: transactional email (OTP / onboarding), Supabase Send Email hook, and https invite deep-link bridge.

**Layout:**

```
C:\splitease\
  app\       Android app
  server\    this repo
```

Known-good baseline: commit [`b04a42d`](https://github.com/sutej-pal/mail-service/commit/b04a42dc694aaf01ba7fd9790c25ee4f02e5313e).

## Local setup (Nodemailer / SMTP)

1. Copy `.env.example` to `.env`.
2. Set Gmail (or other) SMTP vars (`SMTP_USER` is also the From address).
3. Run:

```bash
cd C:\splitease\server
npm install
npm start
```

Health: `GET http://localhost:3001/health` → `{ "service": "splitease-server", ... }`

## Why this exists

Supabase Free Auth email is rate-limited during development. SplitEase Server sends OTP and other mail via your SMTP so signup is not blocked.

### Deploy

- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Env: see `.env.example` (`MAIL_API_KEY`, SMTP_*)

## API

- `GET /health`
- `GET /privacy` — Privacy Policy HTML (also `/privacy.html`)
- `GET /terms` — Terms of Service HTML (also `/terms.html`)
- `GET /invite/:token` — open app / Play bridge + `/.well-known/assetlinks.json`
- `POST /send-mail` — app transactional mail (`x-api-key` if `MAIL_API_KEY` set)
- `POST /supabase/send-email-hook` — Supabase Auth Send Email hook

Legal HTML lives in [`legal/`](legal/). The Android app links to `https://splitease.app/terms` and `https://splitease.app/privacy` — point that host at this server (or mirror these files) before Play submission.

### Rate limiting

In-memory per-IP limits (see `.env.example`):

| Scope | Default | Env |
| --- | --- | --- |
| All routes | 120 / 15 min | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |
| `/send-mail` + send-email hook | 10 / 15 min (IP + recipient) | `RATE_LIMIT_SEND_MAIL_MAX` |

Exceeded requests get `429` with `RateLimit-*` headers. On multi-instance hosts (e.g. Vercel), each instance has its own counter — tighten `RATE_LIMIT_SEND_MAIL_MAX` or add a shared store if you need a hard global cap.

## GitHub rename (optional)

If the GitHub repo is still `sutej-pal/mail-service`, rename it to `splitease-server` and:

```bash
git remote set-url origin https://github.com/sutej-pal/splitease-server.git
```
