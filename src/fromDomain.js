/**
 * Extract the domain part of an email address (lowercase).
 * @param {string} email
 * @returns {string}
 */
export function emailDomain(email) {
  const s = String(email || "").trim();
  const at = s.lastIndexOf("@");
  if (at < 0 || at === s.length - 1) return "";
  return s.slice(at + 1).toLowerCase();
}

/**
 * Exact domain match (case-insensitive). Subdomains are not implied.
 * @param {string} email
 * @param {string[]} allowedDomains
 */
export function isFromDomainAllowed(email, allowedDomains) {
  const domain = emailDomain(email);
  if (!domain || !Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }
  const allowed = new Set(
    allowedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean),
  );
  return allowed.has(domain);
}

/**
 * Parse APP_FROM_DOMAINS_JSON: { "appId": ["domain.com", ...] }
 * @param {string | undefined} raw
 * @returns {Record<string, string[]> | null} null when unset / empty
 */
export function parseAppFromDomainsJson(raw) {
  if (!raw || String(raw).trim() === "") return null;
  try {
    const obj = JSON.parse(String(raw));
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return null;
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (!Array.isArray(v)) continue;
      const domains = v
        .filter((d) => typeof d === "string")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      if (domains.length) out[k.trim()] = domains;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
