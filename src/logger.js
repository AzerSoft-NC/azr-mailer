/**
 * Minimal structured logger (JSON lines). Never log secrets or full mail bodies.
 * @param {{ level?: string }} opts
 */
export function createLogger(opts = {}) {
  const level = (opts.level || "info").toLowerCase();

  function line(severity, event, fields = {}) {
    if (severity === "debug" && level !== "debug") return;
    const payload = {
      ts: new Date().toISOString(),
      severity,
      event,
      ...fields,
    };
    const msg = JSON.stringify(payload);
    if (severity === "error") console.error(msg);
    else console.log(msg);
  }

  return {
    info: (event, fields) => line("info", event, fields),
    warn: (event, fields) => line("warn", event, fields),
    error: (event, fields) => line("error", event, fields),
    debug: (event, fields) => line("debug", event, fields),
  };
}
