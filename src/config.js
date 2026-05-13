import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

let cachedPkgVersion = null;
function readPackageVersion() {
  if (cachedPkgVersion != null) return cachedPkgVersion;
  try {
    const raw = readFileSync(join(rootDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    cachedPkgVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    cachedPkgVersion = "0.0.0";
  }
  return cachedPkgVersion;
}

function parseBool(v, defaultValue) {
  if (v == null || v === "") return defaultValue;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return defaultValue;
}

function parseCsvOrigins(raw) {
  if (!raw || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @returns {Record<string, string>} */
function parseAppTokensJson(raw) {
  if (!raw || String(raw).trim() === "") return {};
  try {
    const obj = JSON.parse(String(raw));
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k === "string" && typeof v === "string" && k && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function parseCsvStrings(raw) {
  if (!raw || String(raw).trim() === "") return null;
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const requireAuthDefault = nodeEnv === "production";

  const smtpPort = Number(env.SMTP_PORT) || 587;
  const smtpSecure =
    env.SMTP_SECURE === "true" || smtpPort === 465;

  const appTokens = parseAppTokensJson(env.APP_TOKENS_JSON);
  const allowedAppIds = parseCsvStrings(env.ALLOWED_APP_IDS);

  return {
    nodeEnv,
    port: Number(env.PORT) || 3000,
    packageVersion: readPackageVersion(),

    requireAuth: parseBool(env.REQUIRE_AUTH, requireAuthDefault),
    authToken: env.AUTH_TOKEN || "",
    appTokens,

    /** If set, only these appIds allowed when using global AUTH_TOKEN mode */
    allowedAppIds,

    allowedOrigins: parseCsvOrigins(env.ALLOWED_ORIGINS),

    smtpHost: env.SMTP_HOST || "",
    smtpPort,
    smtpSecure,
    smtpUser: env.SMTP_USER || "",
    smtpPass: env.SMTP_PASS || "",

    behindProxy: parseBool(env.BEHIND_PROXY, false),

    jsonLimit: env.JSON_BODY_LIMIT || "2mb",

    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS) || 60_000,
    rateLimitMax: Number(env.RATE_LIMIT_MAX) || 60,
    rateLimitPerApp: parseBool(env.RATE_LIMIT_PER_APP, true),

    honeypotField: env.HONEYPOT_FIELD != null ? String(env.HONEYPOT_FIELD) : "",
    clientTsMaxSkewMs: Number(env.CLIENT_TS_MAX_SKEW_MS) || 300_000,

    captchaEnabled: parseBool(env.CAPTCHA_ENABLED, false),

    logLevel: (env.LOG_LEVEL || "info").toLowerCase(),
  };
}
