/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
export function sendError(res, status, code, message) {
  const requestId = res.locals.requestId || "";
  res.status(status).json({
    ok: false,
    error: { code, message },
    requestId,
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} [extra]
 */
export function sendSuccess(res, extra = {}) {
  const requestId = res.locals.requestId || "";
  res.status(200).json({ ok: true, requestId, ...extra });
}
