const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const windowMs = envInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);

/**
 * General per-IP cap for all routes (health / static-ish pages included lightly).
 * Override with RATE_LIMIT_MAX (default 120 / window).
 */
const generalLimiter = rateLimit({
  windowMs,
  max: envInt("RATE_LIMIT_MAX", 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many requests. Please try again later.",
  },
});

/**
 * Stricter cap for mail-sending endpoints (spam / SMTP abuse).
 * Override with RATE_LIMIT_SEND_MAIL_MAX (default 10 / window).
 * Keyed by IP + recipient when present so one IP cannot flood many inboxes as freely.
 */
const sendMailLimiter = rateLimit({
  windowMs,
  max: envInt("RATE_LIMIT_SEND_MAIL_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip);
    const to =
      req.body && typeof req.body.to === "string"
        ? req.body.to.trim().toLowerCase()
        : req.body?.user?.email && typeof req.body.user.email === "string"
          ? String(req.body.user.email).trim().toLowerCase()
          : "";
    return to ? `${ip}:${to}` : ip;
  },
  message: {
    ok: false,
    error: "Email rate limit exceeded. Please try again later.",
  },
});

module.exports = {
  generalLimiter,
  sendMailLimiter,
  windowMs,
};
