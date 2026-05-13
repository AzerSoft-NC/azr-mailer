/**
 * @param {string} s
 */
export function trimString(s) {
  return String(s).trim();
}

/**
 * Strip null bytes and trim (minimal hardening).
 * @param {string} s
 */
export function sanitizeTextField(s) {
  return trimString(s).replace(/\u0000/g, "");
}
