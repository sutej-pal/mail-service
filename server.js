const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
// Keep raw body for the Supabase webhook so signature verification can use the exact payload.
app.use((req, res, next) => {
  if (req.path === "/supabase/send-email-hook") {
    return express.text({ type: "*/*", limit: "1mb" })(req, res, next);
  }
  return express.json({ limit: "1mb" })(req, res, next);
});

const mailFrom = (process.env.MAIL_FROM || "").trim();
const sendEmailHookSecretRaw = (process.env.SEND_EMAIL_HOOK_SECRET || "").trim();
const sendEmailHookSecret = sendEmailHookSecretRaw.replace(/^v1,whsec_/, "");

if (!mailFrom) {
  throw new Error("Missing env var: MAIL_FROM");
}

const requiredEnvVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing env vars: ${missingEnvVars.join(", ")}`);
}

const transporter = nodemailer.createTransport({
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

function isAuthorized(req) {
  const expectedApiKey = process.env.MAIL_API_KEY;
  if (!expectedApiKey) {
    return true;
  }

  const providedApiKey = req.header("x-api-key");
  return providedApiKey === expectedApiKey;
}

/**
 * Shared delivery used by POST /send-mail and the Supabase auth hook.
 * This is the single path for OTP + transactional mail.
 */
async function deliverMail({ to, subject, text, html, fromName }) {
  const from = fromName ? `"${fromName}" <${mailFrom}>` : mailFrom;
  console.log(`deliverMail via smtp to=${to} subject=${subject}`);
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
  return { messageId: info.messageId };
}

function looksLikeOtpToken(token) {
  return typeof token === "string" && /^\d{4,10}$/.test(token.trim());
}

/**
 * Builds OTP / auth email content for /send-mail and the Supabase hook.
 * @param {string} purpose signup | login | magiclink | email | recovery | invite | auth
 * @param {string} token OTP digits from Supabase
 */
function buildOtpMail({ purpose, token }) {
  const action = String(purpose || "auth").trim().toLowerCase();
  const otp = String(token || "").trim();
  const isOtp = looksLikeOtpToken(otp);
  const digits = isOtp ? otp.length : 6;

  const isSignup = action === "signup" || action === "confirm" || action === "confirmation";
  const isLogin =
    action === "login" ||
    action === "magiclink" ||
    action === "email" ||
    action === "otp";

  if (isSignup && isOtp) {
    return {
      subject: "Confirm your SplitEase account",
      fromName: "SplitEase",
      text:
        `Enter this ${digits}-digit verification code in the SplitEase app ` +
        `to activate your account: ${otp}\n\n` +
        "This code expires soon. If you did not create a SplitEase account, you can ignore this email.",
      html:
        "<h2>Confirm your SplitEase account</h2>" +
        `<p>Enter this <strong>${digits}-digit</strong> verification code in the SplitEase app to activate your account:</p>` +
        `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace;">${otp}</p>` +
        "<p>This code expires soon. If you did not create a SplitEase account, you can ignore this email.</p>",
    };
  }

  if (isLogin && isOtp) {
    return {
      subject: "Your SplitEase sign-in code",
      fromName: "SplitEase",
      text:
        `Enter this ${digits}-digit verification code in the SplitEase app to finish signing in: ${otp}\n\n` +
        "This code expires soon. If you did not try to sign in, you can ignore this email.",
      html:
        "<h2>Sign in to SplitEase</h2>" +
        `<p>Enter this <strong>${digits}-digit</strong> verification code in the SplitEase app to finish signing in:</p>` +
        `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace;">${otp}</p>` +
        "<p>This code expires soon. If you did not try to sign in, you can ignore this email.</p>",
    };
  }

  if (isOtp) {
    return {
      subject: "Your SplitEase verification code",
      fromName: "SplitEase",
      text:
        `Your SplitEase verification code is: ${otp}\n\n` +
        "Enter it in the app. If you did not request this, you can ignore this email.",
      html:
        "<h2>SplitEase verification</h2>" +
        `<p>Your verification code:</p>` +
        `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace;">${otp}</p>` +
        "<p>Enter it in the app. If you did not request this, you can ignore this email.</p>",
    };
  }

  const label = action || "auth";
  return {
    subject: "SplitEase authentication",
    fromName: "SplitEase",
    text:
      `A SplitEase authentication event was requested (${label}).` +
      "\n\nIf this wasn't you, you can ignore this email.",
    html:
      `<h2>SplitEase authentication</h2><p>A SplitEase authentication event was requested (<strong>${label}</strong>).</p>` +
      "<p>If this wasn't you, you can ignore this email.</p>",
  };
}

function verifySupabaseWebhook(req, rawBody) {
  if (!sendEmailHookSecret) {
    // Allow until SEND_EMAIL_HOOK_SECRET is set on Render.
    return true;
  }
  const id = req.header("webhook-id");
  const ts = req.header("webhook-timestamp");
  const sig = req.header("webhook-signature");
  if (!id || !ts || !sig) return false;
  const signedContent = `${id}.${ts}.${rawBody}`;
  const expected = require("crypto")
    .createHmac("sha256", Buffer.from(sendEmailHookSecret, "base64"))
    .update(signedContent)
    .digest("base64");
  return String(sig)
    .split(" ")
    .some((part) => {
      const token = String(part).trim();
      if (!token.startsWith("v1,")) return false;
      const actual = token.slice(3);
      const a = Buffer.from(actual);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return require("crypto").timingSafeEqual(a, b);
    });
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "splitease-server",
    transport: "smtp",
  });
});

/**
 * Browser invite bridge:
 * 1) Try open the installed app (splitease:// then intent://).
 * 2) Stay on this page if the hand-off fails — Play Store is manual only.
 *    (Auto-Play redirects to unrelated listings until the app is published.)
 */
app.get("/invite/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return res.status(400).type("html").send(
      "<!DOCTYPE html><html><body><p>Invalid invite link.</p></body></html>",
    );
  }

  const stayHere = `https://${req.get("host")}/invite/${token}`;
  const customUrl = `splitease://invite/${token}`;
  const intentUrl =
    `intent://invite/${token}#Intent;scheme=splitease;package=com.splitease.app;` +
    `S.browser_fallback_url=${encodeURIComponent(stayHere)};end`;
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
      var leftForApp = false;
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") leftForApp = true;
      });
      window.addEventListener("pagehide", function () { leftForApp = true; });
      // Prefer custom scheme (works for sideloaded / emulator installs).
      try { window.location.href = customUrl; } catch (e) {}
      setTimeout(function () {
        if (leftForApp) return;
        try { window.location.href = intentUrl; } catch (e2) {}
      }, 500);
      // No automatic Play Store redirect — user taps Play only if needed.
    })();
  </script>
</head>
<body>
  <h1>SplitEase</h1>
  <p>Opening the invite in the SplitEase app…</p>
  <p class="muted">If nothing happens, tap <strong>Open in SplitEase</strong>. Use Play only if the app is not installed yet.</p>
  <p>
    <a class="btn" href="${intentUrl}">Open in SplitEase</a>
    <a class="btn btn-secondary" href="${playUrl}">Get it on Google Play</a>
  </p>
  <p class="muted"><a href="${customUrl}">Or try the app link</a></p>
</body>
</html>`);
});

/** Digital Asset Links for https App Links verification on this host. */
app.get("/.well-known/assetlinks.json", (_req, res) => {
  res
    .status(200)
    .type("application/json")
    .send(`[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.splitease.app",
      "sha256_cert_fingerprints": [
        "8D:11:61:EF:64:F2:55:7A:00:6A:52:E2:19:12:1B:3B:C7:12:2E:82:97:3A:54:DF:FC:20:EE:93:C2:99:B4:EB",
        "32:73:A2:10:74:E1:E9:47:DE:8D:AD:DD:AB:CA:8C:63:80:1C:82:E6:A3:01:88:A8:75:E2:0B:AC:0B:63:72:DD"
      ]
    }
  }
]
`);
});

/**
 * Primary mail API used by the Android app and by the Supabase OTP hook.
 *
 * Body (transactional):
 *   { to, subject, text?, html?, fromName? }
 *
 * Body (OTP convenience — preferred for verification codes):
 *   { to, otp, purpose?: "signup"|"login", fromName? }
 *   subject/text/html are built server-side when otp is present.
 */
app.post("/send-mail", async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const body = req.body || {};
    const to = String(body.to || "").trim();
    const otp = body.otp != null ? String(body.otp).trim() : "";
    let subject = body.subject;
    let text = body.text;
    let html = body.html;
    let fromName = body.fromName;

    if (otp && looksLikeOtpToken(otp)) {
      const built = buildOtpMail({
        purpose: body.purpose || body.email_action_type || "login",
        token: otp,
      });
      subject = subject || built.subject;
      text = text || built.text;
      html = html || built.html;
      fromName = fromName || built.fromName;
    }

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        ok: false,
        error:
          "to, subject and at least one of text/html are required " +
          "(or pass to + otp to send a verification code)",
      });
    }

    const result = await deliverMail({
      to,
      subject,
      text,
      html,
      fromName,
    });

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

/**
 * Supabase Auth "Send Email" hook.
 * Builds OTP content then delivers through the same /send-mail pipeline (deliverMail).
 */
app.post("/supabase/send-email-hook", async (req, res) => {
  try {
    const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (!verifySupabaseWebhook(req, payload)) {
      return res.status(401).json({
        error: {
          http_code: 401,
          message: "Invalid webhook signature",
        },
      });
    }

    const data = typeof req.body === "string" ? JSON.parse(payload || "{}") : req.body || {};
    const user = data.user || {};
    const emailData = data.email_data || {};
    const to = String(user.email || "").trim();
    if (!to) {
      return res.status(400).json({
        error: {
          http_code: 400,
          message: "Missing user.email",
        },
      });
    }

    const purpose = String(emailData.email_action_type || "auth").trim();
    const token = String(emailData.token || "").trim();
    const mail = buildOtpMail({ purpose, token });

    console.log(
      `supabase-send-email-hook → send-mail pipeline to=${to} action=${purpose}`,
    );

    await deliverMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      fromName: mail.fromName,
    });

    // Supabase expects an empty JSON object on success.
    return res.status(200).json({});
  } catch (error) {
    console.error("supabase send-email-hook failed:", error);
    return res.status(500).json({
      error: {
        http_code: 500,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
});

app.listen(port, () => {
  console.log(`SplitEase Server running on port ${port} (transport=smtp)`);
});
