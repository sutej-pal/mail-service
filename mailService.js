const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email via SMTP (nodemailer).
 * @param {{ to: string, subject: string, text?: string, html?: string, fromName?: string }} options
 * @returns {Promise<{ messageId: string }>}
 */
async function sendMail({ to, subject, text, html, fromName }) {
  const mailFrom = process.env.MAIL_FROM;
  const from = fromName ? `"${fromName}" <${mailFrom}>` : mailFrom;

  // Vercel Runtime Logs: filter for "[splitease-mail]"
  console.info(
    `[splitease-mail] sending from=${from} to=${to} subject=${subject}`,
  );

  const info = await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  console.info(
    `[splitease-mail] sent from=${from} to=${to} subject=${subject} messageId=${info.messageId}`,
  );

  return { messageId: info.messageId };
}

module.exports = { sendMail };
