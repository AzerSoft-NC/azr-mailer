import { sendError, sendSuccess } from "../responses.js";
import { safeEqualSecret } from "../cryptoUtils.js";

/**
 * Extract bearer or x-api-key (legacy).
 * @param {import('express').Request} req
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || "";
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const key = req.headers["x-api-key"];
  if (typeof key === "string" && key) return key.trim();
  return "";
}

/** @typedef {ReturnType<import('../config.js').loadConfig>} AppConfig */

/**
 * @param {AppConfig} config
 */
export function createAuthMiddleware(config) {
  return function authSend(req, res, next) {
    if (!config.requireAuth) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      return sendError(res, 401, "unauthorized", "Missing credentials");
    }

    const appTokens = config.appTokens;
    const keys = Object.keys(appTokens);

    if (keys.length > 0) {
      const appId = req.body?.appId;
      if (typeof appId !== "string" || !appId.trim()) {
        return sendError(
          res,
          401,
          "unauthorized",
          "appId is required for multi-tenant auth",
        );
      }
      const expected = appTokens[appId.trim()];
      if (!expected || !safeEqualSecret(token, expected)) {
        return sendError(res, 401, "unauthorized", "Invalid credentials");
      }
      return next();
    }

    if (!config.authToken) {
      return sendError(res, 500, "auth_misconfigured", "Server auth is not configured");
    }

    if (!safeEqualSecret(token, config.authToken)) {
      return sendError(res, 401, "unauthorized", "Invalid credentials");
    }

    next();
  };
}

/**
 * Legacy /send: global AUTH_TOKEN when multi-tenant map is set.
 * @param {AppConfig} config
 */
export function createLegacyAuthMiddleware(config) {
  return function legacyAuth(req, res, next) {
    if (!config.requireAuth) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      return sendError(res, 401, "unauthorized", "Missing credentials");
    }

    const appTokens = config.appTokens;
    if (Object.keys(appTokens).length > 0) {
      if (!config.authToken) {
        return sendError(
          res,
          401,
          "legacy_auth_unsupported",
          "Multi-tenant tokens are configured; migrate to POST /v1/send with appId or set AUTH_TOKEN for legacy /send",
        );
      }
      if (!safeEqualSecret(token, config.authToken)) {
        return sendError(res, 401, "unauthorized", "Invalid credentials");
      }
      return next();
    }

    if (!config.authToken) {
      return sendError(res, 500, "auth_misconfigured", "Server auth is not configured");
    }

    if (!safeEqualSecret(token, config.authToken)) {
      return sendError(res, 401, "unauthorized", "Invalid credentials");
    }

    next();
  };
}
