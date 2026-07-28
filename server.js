const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
const mailFrom = (process.env.MAIL_FROM || "").trim();
const useResend = Boolean(resendApiKey);

if (!mailFrom) {
  throw new Error("Missing env var: MAIL_FROM");
}

let transporter = null;
if (!useResend) {
  const requiredEnvVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing env vars: ${missingEnvVars.join(", ")} ` +
        `(or set RESEND_API_KEY to send over HTTPS — required on Render Free, which blocks SMTP ports)`,
    );
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Fail fast when SMTP is blocked (e.g. Render Free outbound 25/465/587).
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

function isAuthorized(req) {
  const expectedApiKey = process.env.MAIL_API_KEY;
  if (!expectedApiKey) {
    return true;
  }

  const providedApiKey = req.header("x-api-key");
  return providedApiKey === expectedApiKey;
}

async function sendViaResend({ from, to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: text || undefined,
      html: html || undefined,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof body === "object" && body && (body.message || body.error)
        ? String(body.message || body.error)
        : `HTTP ${response.status}`;
    throw new Error(`Resend send failed: ${detail}`);
  }

  return { messageId: body.id || "resend" };
}

async function sendViaSmtp({ from, to, subject, text, html }) {
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
  return { messageId: info.messageId };
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "smtp-mail-service",
    transport: useResend ? "resend-https" : "smtp",
  });
});

/**
 * Browser invite bridge:
 * 1) Try open the installed app (intent:// / splitease://).
 * 2) If still on the page, fall back to Play Store with invite_token referrer
 *    so first launch can recover the token via Play Install Referrer API.
 */
app.get("/invite/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return res.status(400).type("html").send(
      "<!DOCTYPE html><html><body><p>Invalid invite link.</p></body></html>",
    );
  }

  const intentUrl =
    `intent://invite/${token}#Intent;scheme=splitease;package=com.splitease.app;end`;
  const customUrl = `splitease://invite/${token}`;
  const playUrl =
    "https://play.google.com/store/apps/details?id=com.splitease.app&referrer=" +
    encodeURIComponent(`invite_token=${token}`);

  res
    .status(200)
    .type("html")
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open SplitEase</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1e1b4b; background: #e8eafe; }
    a.btn { display: inline-block; margin-top: 1rem; margin-right: 0.75rem; padding: 0.85rem 1.25rem;
      background: #4f46e5; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; }
    a.btn-secondary { background: #fff; color: #4f46e5; border: 2px solid #4f46e5; }
    p { line-height: 1.5; }
    .muted { color: #5c5878; }
  </style>
  <script>
    (function () {
      var intentUrl = ${JSON.stringify(intentUrl)};
      var customUrl = ${JSON.stringify(customUrl)};
      var playUrl = ${JSON.stringify(playUrl)};
      var leftForApp = false;
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") leftForApp = true;
      });
      window.addEventListener("pagehide", function () { leftForApp = true; });
      try { window.location.replace(intentUrl); } catch (e) {}
      setTimeout(function () {
        if (leftForApp) return;
        try { window.location.href = customUrl; } catch (e2) {}
      }, 400);
      setTimeout(function () {
        if (leftForApp) return;
        try { window.location.href = playUrl; } catch (e3) {}
      }, 1600);
    })();
  </script>
</head>
<body>
  <h1>SplitEase</h1>
  <p>Opening the invite in the SplitEase app…</p>
  <p class="muted">Don’t have the app? We’ll send you to Google Play — after install, the invite opens automatically.</p>
  <p>
    <a class="btn" href="${intentUrl}">Open in SplitEase</a>
    <a class="btn btn-secondary" href="${playUrl}">Get it on Google Play</a>
  </p>
  <p class="muted"><a href="${customUrl}">Or try the app link</a></p>
</body>
</html>`);
});

app.post("/send-mail", async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { to, subject, text, html, fromName } = req.body || {};
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        ok: false,
        error: "to, subject and at least one of text/html are required",
      });
    }

    const from = fromName ? `"${fromName}" <${mailFrom}>` : mailFrom;
    console.log(
      `send-mail via ${useResend ? "resend" : "smtp"} to=${to} subject=${subject}`,
    );

    const result = useResend
      ? await sendViaResend({ from, to, subject, text, html })
      : await sendViaSmtp({ from, to, subject, text, html });

    return res.status(200).json({
      ok: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("send-mail failed:", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(
    `Mail service running on port ${port} (transport=${useResend ? "resend-https" : "smtp"})`,
  );
});
