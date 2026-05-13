/**
 * Optional captcha hook (disabled by default). Phase 2: plug Turnstile/hCaptcha/etc.
 * @param {{ captchaEnabled: boolean }} config
 */
export async function validateCaptchaIfEnabled(config) {
  if (!config.captchaEnabled) return { ok: true };
  return {
    ok: false,
    code: "captcha_not_configured",
    message:
      "Captcha is enabled but no provider is wired yet; set CAPTCHA_ENABLED=false or implement the hook.",
  };
}
