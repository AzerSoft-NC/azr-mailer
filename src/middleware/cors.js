/**
 * Strict CORS for browser clients: allowlist only.
 * @param {{ allowedOrigins: string[] }} config
 */
export function corsMiddleware(config) {
  const allowed = new Set(config.allowedOrigins);

  return function cors(req, res, next) {
    const origin = req.headers.origin;

    if (req.method === "OPTIONS") {
      if (origin && allowed.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Api-Key, X-Request-Id",
        );
        res.setHeader("Access-Control-Max-Age", "86400");
      }
      return res.status(204).end();
    }

    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    next();
  };
}
