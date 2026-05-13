import crypto from "node:crypto";

/**
 * Constant-time-ish comparison of two secret strings (SHA-256 then timingSafeEqual).
 * @param {string} a
 * @param {string} b
 */
export function safeEqualSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b), "utf8").digest();
  return ha.length === hb.length && crypto.timingSafeEqual(ha, hb);
}
