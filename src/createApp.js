import rateLimit from "express-rate-limit";
import express from "express";
import nodemailer from "nodemailer";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { corsMiddleware } from "./middleware/cors.js";
import {
  createAuthMiddleware,
  createLegacyAuthMiddleware,
} from "./middleware/auth.js";
import { sendError, sendSuccess } from "./responses.js";
import {
  sendV1Schema,
  sendLegacySchema,
  formatZodError,
} from "./validation/schemas.js";
import { sanitizeTextField } from "./sanitize.js";
import { validateCaptchaIfEnabled } from "./captcha.js";

/** @param {ReturnType<typeof loadConfig>} config */
function buildDefaultTransporter(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth:
      config.smtpUser && config.smtpPass
        ? { user: config.smtpUser, pass: config.smtpPass }
        : undefined,
  });
}

/**
 * @param {string} html
 */
function sanitizeHtml(html) {
  return String(html).replace(/\u0000/g, "");
}

/**
 * Browser sends Origin; reject if present and not allowlisted.
 * @param {Set<string>} allowed
 */
function originGuard(allowed) {
  return function originGuardMw(req, res, next) {
    if (allowed.size === 0) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    if (allowed.has(origin)) return next();
    return sendError(res, 403, "origin_not_allowed", "Origin not allowed");
  };
}

/** @param {ReturnType<typeof loadConfig>} config */
function createSendRateLimiter(config) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = req.ip || "unknown";
      if (config.rateLimitPerApp) {
        const appId =
          typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
        if (appId) return `${ip}:${appId}`;
      }
      return ip;
    },
    handler: (req, res) => {
      sendError(res, 429, "rate_limited", "Too many requests");
    },
    skip: (req) => {
      if (req.method === "OPTIONS") return true;
      return false;
    },
  });
}

/**
 * @param {{ config?: ReturnType<typeof loadConfig>, transporter?: import('nodemailer').Transporter, logger?: ReturnType<typeof createLogger> }} [opts]
 */
export function createApp(opts = {}) {
  const config = opts.config ?? loadConfig();
  const log = opts.logger ?? createLogger({ level: config.logLevel });
  const transporter = opts.transporter ?? buildDefaultTransporter(config);

  if (config.requireAuth) {
    const hasMulti = Object.keys(config.appTokens).length > 0;
    const hasGlobal = Boolean(config.authToken);
    if (!hasMulti && !hasGlobal) {
      throw new Error(
        "REQUIRE_AUTH is enabled but neither AUTH_TOKEN nor APP_TOKENS_JSON is configured",
      );
    }
  }

  const app = express();
  if (config.behindProxy) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");

  app.use(requestIdMiddleware(log));
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(corsMiddleware(config));

  const allowedOriginSet = new Set(config.allowedOrigins);
  const sendLimiter = createSendRateLimiter(config);

  app.get("/health", (_req, res) => {
    sendSuccess(res, {
      uptime: process.uptime(),
      version: config.packageVersion,
      time: new Date().toISOString(),
    });
  });

  app.get("/ready", (_req, res) => {
    if (!config.smtpHost) {
      return sendError(res, 503, "not_ready", "SMTP is not configured");
    }
    sendSuccess(res, { ready: true });
  });

  const authV1 = createAuthMiddleware(config);
  const authLegacy = createLegacyAuthMiddleware(config);
  const guard = originGuard(allowedOriginSet);

  app.post(
    "/v1/send",
    sendLimiter,
    guard,
    authV1,
    async (req, res) => {
      const logger = res.locals.logger || log;
      const captcha = await validateCaptchaIfEnabled(config);
      if (!captcha.ok) {
        return sendError(
          res,
          501,
          captcha.code || "captcha_error",
          captcha.message || "Captcha validation failed",
        );
      }

      let parsed;
      try {
        parsed = sendV1Schema.parse(req.body);
      } catch (e) {
        return sendError(res, 400, "invalid_payload", formatZodError(e));
      }

      if (config.allowedAppIds && !config.allowedAppIds.includes(parsed.appId)) {
        return sendError(res, 403, "app_forbidden", "appId is not allowed");
      }

      if (config.honeypotField) {
        const trap = req.body?.[config.honeypotField];
        if (trap != null && String(trap).trim() !== "") {
          logger.warn("honeypot_triggered", {
            requestId: res.locals.requestId,
            appId: parsed.appId,
          });
          return sendError(res, 400, "invalid_payload", "Invalid payload");
        }
      }

      if (parsed.clientTs != null) {
        const skew = Math.abs(Date.now() - parsed.clientTs);
        if (skew > config.clientTsMaxSkewMs) {
          return sendError(
            res,
            400,
            "client_ts_out_of_range",
            "clientTs is outside the allowed window",
          );
        }
      }

      if (!config.smtpHost) {
        return sendError(res, 500, "smtp_not_configured", "SMTP is not configured");
      }

      const mail = {
        from: sanitizeTextField(parsed.from),
        to: parsed.to,
        subject: sanitizeTextField(parsed.subject),
        html: sanitizeHtml(parsed.html),
        replyTo: parsed.replyTo ? sanitizeTextField(parsed.replyTo) : undefined,
      };

      try {
        await transporter.sendMail(mail);
        logger.info("mail_sent", {
          requestId: res.locals.requestId,
          appId: parsed.appId,
          metaKeys:
            parsed.meta && typeof parsed.meta === "object"
              ? Object.keys(parsed.meta).slice(0, 20)
              : [],
        });
        return sendSuccess(res);
      } catch (err) {
        logger.error("mail_send_failed", {
          requestId: res.locals.requestId,
          appId: parsed.appId,
          errName: err && typeof err === "object" ? err.constructor?.name : "Error",
        });
        return sendError(
          res,
          502,
          "send_failed",
          "Failed to send email",
        );
      }
    },
  );

  app.post("/send", sendLimiter, guard, authLegacy, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Warning", '299 - "Deprecated: use POST /v1/send"');
    res.setHeader("Link", '</v1/send>; rel="successor-version"');

    const logger = res.locals.logger || log;

    let parsed;
    try {
      parsed = sendLegacySchema.parse(req.body);
    } catch (e) {
      return sendError(res, 400, "invalid_payload", formatZodError(e));
    }

    if (config.honeypotField) {
      const trap = req.body?.[config.honeypotField];
      if (trap != null && String(trap).trim() !== "") {
        logger.warn("honeypot_triggered", { requestId: res.locals.requestId });
        return sendError(res, 400, "invalid_payload", "Invalid payload");
      }
    }

    if (!config.smtpHost) {
      return sendError(res, 500, "smtp_not_configured", "SMTP is not configured");
    }

    try {
      await transporter.sendMail({
        from: sanitizeTextField(parsed.from),
        to: parsed.to,
        subject: sanitizeTextField(parsed.subject),
        html: sanitizeHtml(parsed.html),
      });
      logger.info("mail_sent", {
        requestId: res.locals.requestId,
        appId: "__legacy__",
      });
      return sendSuccess(res);
    } catch (err) {
      logger.error("mail_send_failed", {
        requestId: res.locals.requestId,
        errName: err && typeof err === "object" ? err.constructor?.name : "Error",
      });
      return sendError(res, 502, "send_failed", "Failed to send email");
    }
  });

  return app;
}
