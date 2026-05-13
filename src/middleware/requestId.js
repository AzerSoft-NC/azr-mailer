import crypto from "node:crypto";

const HEADER = "x-request-id";

/** @param {ReturnType<import('../logger.js').createLogger>} log */
export function requestIdMiddleware(log) {
  return function requestId(req, res, next) {
    const incoming = req.headers[HEADER];
    const id =
      typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 128
        ? incoming.trim()
        : crypto.randomUUID();
    res.locals.requestId = id;
    res.setHeader(HEADER, id);
    res.locals.logger = log;
    next();
  };
}
