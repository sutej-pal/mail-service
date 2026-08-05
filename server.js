const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
require("dotenv").config();

const { sendMail } = require("./mailService");
const { generalLimiter, sendMailLimiter } = require("./rateLimit");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));
app.use(generalLimiter);

const sendEmailHookSecretRaw = (process.env.SEND_EMAIL_HOOK_SECRET || "").trim();
const sendEmailHookSecret = sendEmailHookSecretRaw.replace(/^v1,whsec_/, "");

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

  const isSignup =
    action === "signup" || action === "confirm" || action === "confirmation";
  const isLogin =
    action === "login" ||
    action === "magiclink" ||
    action === "email" ||
    action === "otp";
  const isRecovery = action === "recovery" || action === "reset";

  if (isRecovery && isOtp) {
    return {
      subject: "Reset your SplitEase password",
      fromName: "SplitEase",
      text:
        `Enter this ${digits}-digit code in the SplitEase app to create a password: ${otp}\n\n` +
        "This code expires soon. If you did not request a password reset, you can ignore this email.",
      html:
        "<h2>Reset your SplitEase password</h2>" +
        `<p>Enter this <strong>${digits}-digit</strong> code in the SplitEase app to create a password:</p>` +
        `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace;">${otp}</p>` +
        "<p>This code expires soon. If you did not request a password reset, you can ignore this email.</p>",
    };
  }

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
    // Allow until SEND_EMAIL_HOOK_SECRET is set on Vercel.
    return true;
  }
  const id = req.header("webhook-id");
  const ts = req.header("webhook-timestamp");
  const sig = req.header("webhook-signature");
  if (!id || !ts || !sig) return false;
  const signedContent = `${id}.${ts}.${rawBody}`;
  const expected = crypto
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
      return crypto.timingSafeEqual(a, b);
    });
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "splitease-server" });
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

// TODO: re-enable MAIL_API_KEY / x-api-key auth once mail flow is stable (see TODO.md).
/**
 * Body (transactional): { to, subject, text?, html?, fromName? }
 * Body (OTP):           { to, otp, purpose?: "signup"|"login", fromName? }
 */
app.post("/send-mail", sendMailLimiter, async (req, res) => {
  try {
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

    const result = await sendMail({ to, subject, text, html, fromName });
    return res.status(200).json({ ok: true, messageId: result.messageId });
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
 * Builds OTP content then delivers through mailService.
 */
app.post("/supabase/send-email-hook", sendMailLimiter, async (req, res) => {
  try {
    const payload =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

    console.info("[splitease-mail] send-email-hook received");

    if (!verifySupabaseWebhook(req, payload)) {
      console.warn("[splitease-mail] send-email-hook rejected: invalid signature");
      return res.status(401).json({
        error: {
          http_code: 401,
          message: "Invalid webhook signature",
        },
      });
    }

    const data =
      typeof req.body === "string" ? JSON.parse(payload || "{}") : req.body || {};
    const user = data.user || {};
    const emailData = data.email_data || {};
    const to = String(user.email || "").trim();
    if (!to) {
      console.warn("[splitease-mail] send-email-hook missing user.email");
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

    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      fromName: mail.fromName,
    });

    // Supabase expects an empty JSON object on success.
    return res.status(200).json({});
  } catch (error) {
    console.error("[splitease-mail] send-email-hook failed:", error);
    return res.status(500).json({
      error: {
        http_code: 500,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
});

// Local/dev only — Vercel uses the exported app as a serverless function.
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`SplitEase Server running on port ${port}`);
  });
}

module.exports = app;
