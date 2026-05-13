import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/createApp.js";

const sent = [];

/**
 * @param {Record<string, string | number | boolean | undefined>} envPatch
 */
function applyEnv(envPatch) {
  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
}

function defaultTestEnv() {
  applyEnv({
    NODE_ENV: "test",
    REQUIRE_AUTH: "true",
    AUTH_TOKEN: "unit-test-token",
    SMTP_HOST: "smtp.test",
    ALLOWED_ORIGINS: "https://allowed.example",
    RATE_LIMIT_MAX: "1000",
    RATE_LIMIT_WINDOW_MS: "600000",
    RATE_LIMIT_PER_APP: "true",
    BEHIND_PROXY: "false",
    CAPTCHA_ENABLED: "false",
    HONEYPOT_FIELD: "",
  });
}

describe("azr-mailer integration", () => {
  beforeEach(() => {
    sent.length = 0;
    defaultTestEnv();
  });

  test("GET /health returns ok and metadata", async () => {
    const app = createApp({ config: loadConfig() });
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(typeof res.body.uptime === "number");
    assert.ok(res.body.version);
    assert.ok(res.body.time);
    assert.ok(res.headers["x-request-id"]);
  });

  test("POST /v1/send succeeds with valid payload and mock SMTP", async () => {
    const config = loadConfig();
    const transporter = {
      sendMail: async (/** @type {any} */ mail) => {
        sent.push(mail);
      },
    };
    const app = createApp({ config, transporter });
    const res = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send({
        appId: "any-app",
        from: "from@example.com",
        to: "to@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.requestId);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, "from@example.com");
  });

  test("POST /v1/send rejects invalid payload", async () => {
    const app = createApp({ config: loadConfig(), transporter: { sendMail: async () => {} } });
    const res = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send({
        appId: "any-app",
        from: "not-an-email",
        to: "to@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, "invalid_payload");
  });

  test("POST /v1/send rejects unauthorized", async () => {
    const app = createApp({ config: loadConfig(), transporter: { sendMail: async () => {} } });
    const res = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer wrong")
      .send({
        appId: "any-app",
        from: "from@example.com",
        to: "to@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, "unauthorized");
  });

  test("POST /v1/send rejects disallowed Origin", async () => {
    const app = createApp({ config: loadConfig(), transporter: { sendMail: async () => {} } });
    const res = await request(app)
      .post("/v1/send")
      .set("Origin", "https://evil.example")
      .set("Authorization", "Bearer unit-test-token")
      .send({
        appId: "any-app",
        from: "from@example.com",
        to: "to@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "origin_not_allowed");
  });

  test("OPTIONS /v1/send handles CORS preflight", async () => {
    const app = createApp({ config: loadConfig() });
    const res = await request(app)
      .options("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], "https://allowed.example");
  });

  test("GET /ready returns 200 when SMTP configured", async () => {
    const app = createApp({ config: loadConfig() });
    const res = await request(app).get("/ready");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ready, true);
  });

  test("GET /ready returns 503 when SMTP missing", async () => {
    applyEnv({ SMTP_HOST: "" });
    const app = createApp({ config: loadConfig() });
    const res = await request(app).get("/ready");
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, "not_ready");
  });

  test("rate limit returns 429 after burst", async () => {
    applyEnv({ RATE_LIMIT_MAX: "2", RATE_LIMIT_WINDOW_MS: "60000" });
    const config = loadConfig();
    const app = createApp({
      config,
      transporter: { sendMail: async () => {} },
    });
    const payload = {
      appId: "rl",
      from: "from@example.com",
      to: "to@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
    };
    const r1 = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send(payload);
    const r2 = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send(payload);
    const r3 = await request(app)
      .post("/v1/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send(payload);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.equal(r3.body.error.code, "rate_limited");
  });

  test("POST /send legacy still works and exposes deprecation headers", async () => {
    const app = createApp({
      config: loadConfig(),
      transporter: {
        sendMail: async (/** @type {any} */ m) => {
          sent.push(m);
        },
      },
    });
    const res = await request(app)
      .post("/send")
      .set("Origin", "https://allowed.example")
      .set("Authorization", "Bearer unit-test-token")
      .send({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Legacy",
        html: "<p>Old</p>",
      });
    assert.equal(res.status, 200);
    assert.equal(res.headers.deprecation, "true");
    assert.ok(String(res.headers.link || "").includes("/v1/send"));
    assert.equal(sent.length, 1);
  });
});
