# Mail Service (Render)

Small reusable Node.js mail API you can deploy on Render and call from any app/backend.

**Render Free note:** outbound SMTP ports `25` / `465` / `587` are blocked. Use `RESEND_API_KEY` (HTTPS) on Free, or upgrade the instance to use SMTP.

## 1) Setup locally

1. Copy `.env.example` to `.env`.
2. Prefer `RESEND_API_KEY` + `MAIL_FROM` (HTTPS). SMTP vars work on hosts that allow outbound SMTP.
3. Install and run:

```bash
npm install
npm start
```

Health check:

```bash
GET http://localhost:3000/health
```

## 2) Render deployment

Create a new **Web Service** from `mail-service` and set:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

Add environment variables from `.env.example` in Render dashboard.

Minimum for Free tier:

| Key | Value |
|---|---|
| `MAIL_API_KEY` | Shared secret (Android `MAIL_SERVICE_API_KEY`) |
| `MAIL_FROM` | `onboarding@resend.dev` (test) or your verified domain sender |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) |

## 3) API

### `GET /invite/:token`

Public browser bridge for invite links:

1. Tries to open the installed SplitEase app (`splitease://` then `intent://`).
2. Stays on the page if the hand-off fails — **does not** auto-open Play Store
   (Play is a manual button; auto-redirect shows unrelated apps until publish).
3. Serves Digital Asset Links at `GET /.well-known/assetlinks.json` for App Links.

Example:

```
https://<your-render-service>.onrender.com/invite/<token>
```

**Note:** Full Install Referrer E2E requires a Play install (Internal testing is enough). Sideload / Android Studio Run will not populate the referrer.

### `POST /send-mail`

Headers:

- `Content-Type: application/json`
- `x-api-key: <MAIL_API_KEY>` (required only if `MAIL_API_KEY` is set)

Body:

```json
{
  "to": "user@example.com",
  "subject": "Project Invite",
  "text": "You were invited to our app",
  "html": "<b>You were invited to our app</b>",
  "fromName": "Your App Name"
}
```

Rules:

- Required: `to`, `subject`, and at least one of `text` or `html`.
- Response success: `{ "ok": true, "messageId": "..." }`.

### `POST /supabase/send-email-hook`

Supabase Auth Hook endpoint (Send Email hook) so signup OTP emails are sent by this service instead of Supabase default templates.

- Expected payload: Supabase Send Email Hook JSON (`user`, `email_data`).
- Signature verification:
  - If `SEND_EMAIL_HOOK_SECRET` is set, this endpoint verifies `webhook-id`, `webhook-timestamp`, `webhook-signature`.
  - If not set, it accepts requests (dev fallback).

Recommended Supabase config:

- Auth → Hooks → Send Email:
  - URL: `https://<your-render-service>.onrender.com/supabase/send-email-hook`
  - Secret: generated in the hook UI (also set as `SEND_EMAIL_HOOK_SECRET` on Render)
- Auth → Providers → Email:
  - Confirm email ON
  - OTP length = `6`

## 4) Example client call

```bash
curl -X POST https://<your-render-service>.onrender.com/send-mail \
  -H "Content-Type: application/json" \
  -H "x-api-key: <MAIL_API_KEY>" \
  -d "{\"to\":\"user@example.com\",\"subject\":\"Hello\",\"text\":\"Test mail\"}"
```

## 5) Recommended provider notes

- On Render Free, set `RESEND_API_KEY` — do not rely on Gmail SMTP (`smtp.gmail.com:465`).
- Use a verified domain and sender address to improve deliverability.
- Keep `MAIL_API_KEY` set in production.
- Do not expose SMTP / Resend credentials in mobile apps; call this service with the shared API key only.
