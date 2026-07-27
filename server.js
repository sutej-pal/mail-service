const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

const requiredEnvVars = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM"
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  // Fail fast so deployment errors are visible immediately.
  throw new Error(`Missing env vars: ${missingEnvVars.join(", ")}`);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function isAuthorized(req) {
  const expectedApiKey = process.env.MAIL_API_KEY;
  if (!expectedApiKey) {
    return true;
  }

  const providedApiKey = req.header("x-api-key");
  return providedApiKey === expectedApiKey;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "smtp-mail-service" });
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
        error: "to, subject and at least one of text/html are required"
      });
    }

    const fromAddress = process.env.MAIL_FROM;
    const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    return res.status(200).json({
      ok: true,
      messageId: info.messageId
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.listen(port, () => {
  console.log(`Mail service running on port ${port}`);
});
