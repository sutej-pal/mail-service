const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const { sendMail } = require("./mailService");
const { generalLimiter, sendMailLimiter } = require("./rateLimit");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));
app.use(generalLimiter);

const legalDir = path.join(__dirname, "legal");

/**
 * Serves a static legal HTML page from /legal.
 * @param {string} fileName File under legal/
 */
function sendLegalPage(res, fileName) {
  const filePath = path.join(legalDir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).type("text").send("Not found");
  }
  return res.status(200).type("html").send(fs.readFileSync(filePath, "utf8"));
}

const sendEmailHookSecretRaw = (process.env.SEND_EMAIL_HOOK_SECRET || "").trim();
const sendEmailHookSecret = sendEmailHookSecretRaw.replace(/^v1,whsec_/, "");

function looksLikeOtpToken(token) {
  return typeof token === "string" && /^\d{4,10}$/.test(token.trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOtpHtmlTemplate({
  title,
  intro,
  otp,
  expiryNote,
  footerNote,
  icon,
  showWhatsNext,
}) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeOtp = escapeHtml(otp);
  const safeExpiry = escapeHtml(expiryNote);
  const safeFooter = escapeHtml(footerNote);
  const safeIcon = escapeHtml(icon);
  const whatsNextSection = showWhatsNext
    ? `
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAFD; border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px 0; font-size:12px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#5B5FEF;">What's next</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70; vertical-align:top; width:20px;">1.</td>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70;">Enter the code above in the app</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70; vertical-align:top;">2.</td>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70;">Set up your profile</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70; vertical-align:top;">3.</td>
                        <td style="padding:4px 0; font-size:14px; color:#5c5f70;">Create or join a group to start splitting expenses</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
</head>
<body style="margin:0; padding:0; background-color:#f2f4f7; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f7; padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden;">
          <tr>
            <td align="center" style="padding:36px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px; height:36px; background-color:#5B5FEF; border-radius:9px; text-align:center; line-height:36px;">
                    <span style="color:#ffffff; font-size:18px; font-weight:700;">S</span>
                  </td>
                  <td style="padding-left:8px;">
                    <span style="font-size:20px; font-weight:700; color:#1a1a2e;">SplitEase</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:64px; height:64px; background-color:#EEF0FF; border-radius:50%;">
                <tr>
                  <td align="center" valign="middle" style="font-size:28px;">${safeIcon}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 0 40px;">
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#1a1a2e;">${safeTitle}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 40px 0 40px;">
              <p style="margin:0; font-size:15px; line-height:22px; color:#5c5f70;">
                ${safeIntro}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#F7F7FC; border:1px solid #E4E4F0; border-radius:10px; padding:18px 36px;">
                    <span style="font-size:32px; font-weight:700; letter-spacing:8px; color:#1a1a2e; font-family:'Courier New', monospace;">${safeOtp}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 0 40px;">
              <p style="margin:0; font-size:13px; color:#9296a6;">
                ${safeExpiry}
              </p>
            </td>
          </tr>
${whatsNextSection}
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <div style="border-top:1px solid #EEEEF3;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 40px 36px 40px;">
              <p style="margin:0; font-size:13px; line-height:20px; color:#9296a6;">
                ${safeFooter}
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr>
            <td align="center">
              <p style="margin:0; font-size:12px; color:#a7aab8;">&copy; ${new Date().getFullYear()} SplitEase. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
        `Reset your SplitEase password\n\n` +
        `Enter this ${digits}-digit code in the SplitEase app to create a new password:\n` +
        `${otp}\n\n` +
        `This code expires soon.\n\n` +
        "If you did not request a password reset, you can safely ignore this email - your account is still secure.",
      html: buildOtpHtmlTemplate({
        title: "Reset your password",
        intro: "Enter this 6-digit code in the SplitEase app to create a new password.",
        otp,
        expiryNote: "⏱ This code expires soon.",
        footerNote:
          "If you did not request a password reset, you can safely ignore this email - your account is still secure.",
        icon: "🔒",
        showWhatsNext: false,
      }),
    };
  }

  if (isSignup && isOtp) {
    return {
      subject: "Confirm your SplitEase account",
      fromName: "SplitEase",
      text:
        `Welcome to SplitEase!\n\n` +
        `You're almost set up. Enter this ${digits}-digit code in the app to verify your email and activate your account:\n` +
        `${otp}\n\n` +
        "This code expires in 10 minutes.\n\n" +
        "If you didn't create a SplitEase account, you can safely ignore this email.",
      html: buildOtpHtmlTemplate({
        title: "Welcome to SplitEase!",
        intro:
          "You're almost set up. Enter this code in the app to verify your email and activate your account.",
        otp,
        expiryNote: "⏱ This code expires in 10 minutes.",
        footerNote:
          "If you didn't create a SplitEase account, you can safely ignore this email.",
        icon: "👋",
        showWhatsNext: true,
      }),
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

/** Public legal pages (Play Store + in-app signup links). */
app.get(["/privacy", "/privacy.html"], (_req, res) => {
  sendLegalPage(res, "privacy.html");
});

app.get(["/terms", "/terms.html"], (_req, res) => {
  sendLegalPage(res, "terms.html");
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
