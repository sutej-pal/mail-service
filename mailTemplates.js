const fs = require("node:fs");
const path = require("node:path");
const catalog = require("./mail-templates/catalog");

const templatesDir = path.join(__dirname, "mail-templates");

const fileCache = new Map();

/** Keys interpolated as trusted HTML fragments (never user-supplied). */
const RAW_HTML_KEYS = new Set([
  "whatsNextBlock",
  "bodyHtml",
  "noteBlockHtml",
  "noteHtml",
  "introBlock",
  "mainBlock",
  "extraBlock",
  "linkHref",
]);

/**
 * @param {string} relativePath Path under mail-templates/
 * @returns {string}
 */
function readTemplateFile(relativePath) {
  const resolved = path.join(templatesDir, relativePath);
  if (!resolved.startsWith(templatesDir)) {
    throw new Error(`Invalid template path: ${relativePath}`);
  }
  if (!fileCache.has(resolved)) {
    fileCache.set(resolved, fs.readFileSync(resolved, "utf8"));
  }
  return fileCache.get(resolved);
}

/**
 * Escape HTML special characters.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape text then convert newlines to <br/> for email HTML.
 * @param {unknown} value
 * @returns {string}
 */
function textToHtml(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

/**
 * Strip CR/LF so values cannot inject email headers.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHeader(value) {
  return String(value ?? "")
    .replace(/[\r\n\u0000]+/g, " ")
    .trim();
}

/**
 * Allow only http(s) URLs for href interpolation.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return raw;
    }
  } catch (_err) {
    // ignore
  }
  return "";
}

/** Stable production host for email asset URLs (must not be a per-deploy Vercel URL). */
const EMAIL_ASSET_BASE_URL = "https://splitease-server-eight.vercel.app";

/**
 * Public origin used for assets embedded in outbound email HTML.
 * Prefer PUBLIC_BASE_URL; otherwise use the stable production host so logos in
 * sent mail keep working after preview deployments expire.
 * @returns {string}
 */
function publicBaseUrl() {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return EMAIL_ASSET_BASE_URL;
}

/**
 * Absolute URL for the SplitEase app icon used in email headers.
 * @returns {string}
 */
function brandLogoUrl() {
  return `${publicBaseUrl()}/assets/splitease-icon.png`;
}

/**
 * Replace {{key}} placeholders.
 * Trusted layout fragments use RAW_HTML_KEYS (loaded from disk or built here).
 * @param {string} source
 * @param {Record<string, unknown>} vars
 * @param {{ html?: boolean }} [options]
 */
function interpolate(source, vars, options = {}) {
  const htmlMode = Boolean(options.html);
  return String(source).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const raw = vars[key];
    if (raw == null) return "";
    if (!htmlMode) return String(raw);
    if (RAW_HTML_KEYS.has(key)) return String(raw);
    return escapeHtml(raw);
  });
}

/**
 * @param {string} relativePath
 * @param {Record<string, unknown>} vars
 * @param {{ html?: boolean }} [options]
 */
function renderFile(relativePath, vars, options = {}) {
  return interpolate(readTemplateFile(relativePath), vars, options);
}

/**
 * Optional intro paragraph row for the card layout.
 * @param {string} intro
 * @returns {string}
 */
function buildIntroBlock(intro) {
  const text = String(intro ?? "").trim();
  if (!text) return "";
  return renderFile("fragments/intro-block.html", { intro: text }, { html: true });
}

/**
 * Branded card shell shared by every SplitEase email.
 * @param {{
 *   pageTitle: string,
 *   icon: string,
 *   title: string,
 *   intro?: string,
 *   mainBlock?: string,
 *   extraBlock?: string,
 *   footerNote: string,
 *   year?: string,
 * }} input
 * @returns {string}
 */
function buildCardMail(input) {
  const year = input.year || String(new Date().getFullYear());
  return renderFile(
    "card-layout.html",
    {
      pageTitle: input.pageTitle || input.title,
      logoUrl: brandLogoUrl(),
      icon: input.icon,
      title: input.title,
      introBlock: buildIntroBlock(input.intro),
      mainBlock: input.mainBlock || "",
      extraBlock: input.extraBlock || "",
      footerNote: input.footerNote,
      year,
    },
    { html: true },
  );
}

/**
 * Builds OTP / auth email content for /send-mail and the Supabase hook.
 * @param {{ purpose: string, token: string }} input
 */
function buildOtpMail({ purpose, token }) {
  const action = String(purpose || "auth").trim().toLowerCase();
  const otp = String(token || "").trim();
  const isOtp = typeof otp === "string" && /^\d{4,10}$/.test(otp);
  const digits = isOtp ? otp.length : 6;

  const isSignup =
    action === "signup" || action === "confirm" || action === "confirmation";
  const isLogin =
    action === "login" ||
    action === "magiclink" ||
    action === "email" ||
    action === "otp";
  const isRecovery =
    action === "recovery" ||
    action === "reset" ||
    action === "reset_password" ||
    action === "password_reset" ||
    action === "recovery_email";

  let key = "auth";
  if (isRecovery && isOtp) key = "recovery";
  else if (isSignup && isOtp) key = "signup";
  else if (isLogin && isOtp) key = "login";
  else if (isOtp) key = "verify";

  const entry = catalog.otp[key];
  const vars = {
    otp,
    digits: String(digits),
    label: action || "auth",
    year: String(new Date().getFullYear()),
  };

  const text = renderFile(entry.textFile, vars);

  const intro =
    entry.introTemplate != null
      ? interpolate(entry.introTemplate, vars)
      : entry.intro;

  if (!entry.useLayout) {
    return {
      subject: entry.subject,
      fromName: entry.fromName,
      text,
      html: buildCardMail({
        pageTitle: entry.pageTitle || entry.title,
        icon: entry.icon,
        title: entry.title,
        intro,
        footerNote: entry.footerNote,
        year: vars.year,
      }),
    };
  }

  const mainBlock = isOtp
    ? renderFile(
        "fragments/otp-code-block.html",
        {
          otp,
          expiryNote: entry.expiryNote,
        },
        { html: true },
      )
    : "";

  const extraBlock =
    entry.showWhatsNext && key === "signup"
      ? readTemplateFile("otp-whats-next.html")
      : "";

  const html = buildCardMail({
    pageTitle: entry.pageTitle || entry.title,
    icon: entry.icon,
    title: entry.title,
    intro,
    mainBlock,
    extraBlock,
    footerNote: entry.footerNote,
    year: vars.year,
  });

  return {
    subject: entry.subject,
    fromName: entry.fromName,
    text,
    html,
  };
}

/**
 * Sanitize / normalize vars before rendering a transactional template.
 * @param {string} templateId
 * @param {Record<string, unknown>} vars
 * @returns {Record<string, unknown>}
 */
function prepareTransactionalVars(templateId, vars) {
  const out = { ...vars };

  if (templateId === "invite-friend" || templateId === "invite-group") {
    out.linkHref = sanitizeHttpUrl(vars.link);
    out.link = out.linkHref;
    if (vars.groupName != null) {
      out.groupName = sanitizeHeader(vars.groupName);
    }
    if (vars.inviterName != null) {
      out.inviterName = sanitizeHeader(vars.inviterName);
    }
  }

  if (templateId === "reminder") {
    const body = String(vars.body ?? "");
    const note = String(vars.note ?? "").trim();
    out.body = body;
    out.note = note;
    out.bodyHtml = textToHtml(body);
    out.noteHtml = note ? textToHtml(note) : "";
  }

  if (templateId === "welcome" && vars.displayName != null) {
    out.displayName = sanitizeHeader(vars.displayName);
  }

  return out;
}

/**
 * Resolve catalog copy that may use {{var}} placeholders.
 * @param {string | undefined} template
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
function resolveCopy(template, vars) {
  if (template == null) return "";
  return interpolate(template, vars);
}

/**
 * HTML body for a named transactional template using the shared card layout.
 * @param {string} templateId
 * @param {Record<string, unknown>} vars
 */
function buildTransactionalHtml(templateId, vars) {
  const entry = catalog.transactional[templateId];
  if (!entry) {
    throw new Error(`Unknown mail template: ${templateId}`);
  }

  const title =
    entry.titleTemplate != null
      ? resolveCopy(entry.titleTemplate, vars)
      : entry.title || "";
  const intro =
    entry.introTemplate != null
      ? resolveCopy(entry.introTemplate, vars)
      : entry.intro != null
        ? String(entry.intro)
        : "";

  let mainBlock = "";
  let extraBlock = "";

  if (templateId === "invite-friend" || templateId === "invite-group") {
    if (vars.linkHref) {
      mainBlock = renderFile(
        "fragments/invite-cta-block.html",
        {
          linkHref: vars.linkHref,
          link: vars.linkHref,
        },
        { html: true },
      );
    }
  }

  if (templateId === "reminder") {
    mainBlock = renderFile(
      "fragments/reminder-body-block.html",
      { bodyHtml: vars.bodyHtml },
      { html: true },
    );
    if (vars.noteHtml) {
      extraBlock = renderFile(
        "fragments/reminder-note-block.html",
        { noteHtml: vars.noteHtml },
        { html: true },
      );
    }
  }

  if (templateId === "welcome" && entry.showWhatsNext) {
    extraBlock = readTemplateFile("fragments/welcome-whats-next.html");
  }

  return buildCardMail({
    pageTitle: resolveCopy(entry.pageTitle || title, vars),
    icon: entry.icon,
    title,
    intro,
    mainBlock,
    extraBlock,
    footerNote: entry.footerNote,
    year: String(new Date().getFullYear()),
  });
}

/**
 * Renders a named transactional template from mail-templates/.
 * @param {string} templateId welcome | invite-friend | invite-group | reminder
 * @param {Record<string, unknown>} vars
 */
function buildNamedMail(templateId, vars = {}) {
  const id = String(templateId || "").trim();
  const entry = catalog.transactional[id];
  if (!entry) {
    throw new Error(`Unknown mail template: ${id}`);
  }

  const safeVars = prepareTransactionalVars(id, vars);

  const subject =
    entry.subjectTemplate != null
      ? sanitizeHeader(interpolate(entry.subjectTemplate, safeVars))
      : safeVars.subject != null && String(safeVars.subject).trim()
        ? sanitizeHeader(safeVars.subject)
        : entry.subject;

  const text = entry.textFile
    ? renderFile(entry.textFile, safeVars)
    : safeVars.text != null
      ? String(safeVars.text)
      : undefined;

  const html = buildTransactionalHtml(id, safeVars);

  return {
    subject,
    fromName: entry.fromName || "SplitEase",
    text,
    html,
  };
}

/**
 * Clears the in-memory template cache (tests / hot reload).
 */
function clearTemplateCache() {
  fileCache.clear();
}

module.exports = {
  buildOtpMail,
  buildNamedMail,
  buildCardMail,
  escapeHtml,
  sanitizeHttpUrl,
  sanitizeHeader,
  clearTemplateCache,
  templatesDir,
};
