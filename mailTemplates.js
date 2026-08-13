const fs = require("node:fs");
const path = require("node:path");
const catalog = require("./mail-templates/catalog");

const templatesDir = path.join(__dirname, "mail-templates");

const fileCache = new Map();

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

/**
 * Replace {{key}} placeholders.
 * Trusted layout fragments: whatsNextBlock only (loaded from disk).
 * Keys ending in Html are escaped unless allowRawHtmlKeys is set (unused for user input).
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
    // Trusted static fragment from otp-whats-next.html only.
    if (key === "whatsNextBlock") return String(raw);
    // Pre-built safe HTML fragments produced by this module (already escaped).
    if (key === "bodyHtml" || key === "noteBlockHtml") return String(raw);
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

  if (key === "auth" || !entry.useLayout) {
    return {
      subject: entry.subject,
      fromName: entry.fromName,
      text: renderFile(entry.textFile, vars),
      html:
        `<h2>SplitEase authentication</h2>` +
        `<p>A SplitEase authentication event was requested (<strong>${escapeHtml(
          vars.label,
        )}</strong>).</p>` +
        "<p>If this wasn't you, you can ignore this email.</p>",
    };
  }

  const whatsNextBlock = entry.showWhatsNext
    ? readTemplateFile("otp-whats-next.html")
    : "";
  const html = renderFile(
    "otp-layout.html",
    {
      ...vars,
      title: entry.title,
      intro: entry.intro,
      expiryNote: entry.expiryNote,
      footerNote: entry.footerNote,
      icon: entry.icon,
      whatsNextBlock,
    },
    { html: true },
  );

  return {
    subject: entry.subject,
    fromName: entry.fromName,
    text: renderFile(entry.textFile, vars),
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
    out.link = sanitizeHttpUrl(vars.link);
    if (vars.groupName != null) {
      out.groupName = sanitizeHeader(vars.groupName);
    }
    if (vars.inviterName != null) {
      out.inviterName = sanitizeHeader(vars.inviterName);
    }
  }

  if (templateId === "reminder") {
    // Always rebuild HTML from plain text — never trust client bodyHtml/noteBlockHtml.
    const body = String(vars.body ?? "");
    const note = String(vars.note ?? "").trim();
    out.body = body;
    out.note = note;
    out.bodyHtml = textToHtml(body);
    out.noteBlockHtml = note
      ? `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>` +
        `<p style="color:#555">${textToHtml(note)}</p>`
      : "";
  }

  if (templateId === "welcome" && vars.displayName != null) {
    out.displayName = sanitizeHeader(vars.displayName);
  }

  return out;
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

  let html;
  if (entry.htmlFile) {
    html = renderFile(entry.htmlFile, safeVars, { html: true });
  }

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
  escapeHtml,
  sanitizeHttpUrl,
  sanitizeHeader,
  clearTemplateCache,
  templatesDir,
};
