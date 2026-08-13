# Mail templates

**Single source of truth** for SplitEase outbound email copy and HTML.

Edit files here, then redeploy the server. Do not hardcode email HTML in `server.js`, `app/mail-service`, or the Android app.

## Layout

| Path | Used for |
| --- | --- |
| `otp-layout.html` | Shared branded shell for OTP emails (`{{title}}`, `{{otp}}`, …) |
| `otp-*.txt` + entries in `catalog.js` | Signup / recovery / login / verify / auth OTP |
| `welcome.txt` | Onboarding welcome (`template: welcome`) |
| `invite-friend.*` / `invite-group.*` | Invite emails (`template: invite-friend` \| `invite-group`) |
| `reminder.*` | Balance reminder wrapper (`template: reminder`) |
| `supabase/*.html` | Paste into Supabase Auth → Email Templates when the Send Email hook is off |

## Placeholders

Server interpolation uses `{{name}}` (double curly braces). Values are HTML-escaped in HTML bodies unless the key ends with `Html` (raw HTML fragment).

Supabase dashboard files use Go template syntax: `{{ .Token }}`.

## Sending from the app

`POST /send-mail` accepts either raw `subject`/`text`/`html`, or:

```json
{
  "to": "user@example.com",
  "template": "invite-group",
  "vars": { "inviterName": "Ada", "groupName": "Trip", "link": "https://…" }
}
```

OTP continues via `otp` + `purpose`, or the Supabase Send Email hook.

## Reminder body drafts

In-app editable reminder bodies live in Android `strings.xml` (`remind_template_*`) so users can edit before send. Keep those strings aligned with the drafts under `reminder/body-*.txt` when you change copy.
