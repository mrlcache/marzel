import assert from "node:assert/strict";
import test from "node:test";

const { deliverOperationalEvent } = await import("../worker/src/analytics.js");
const env = { ANALYTICS_ENABLED: "true", POSTHOG_PROJECT_API_KEY: "phc_test", POSTHOG_API_HOST: "https://posthog.test" };

test("Worker analytics has a stable PostHog insert id for idempotent authoritative events", async () => {
  const payloads = [];
  const fetchImpl = async (_url, options) => { payloads.push(JSON.parse(options.body)); return { ok: true }; };
  const row = { event_key: "provider-event-1", account_id: 17, event_name: "account_created", payload: { authentication_method: "google", timestamp: "2026-08-12T12:00:00.000Z", schema_version: 1 } };
  assert.equal(await deliverOperationalEvent(env, row, fetchImpl), true);
  assert.equal(await deliverOperationalEvent(env, row, fetchImpl), true);
  assert.equal(payloads[0].batch[0].properties.$insert_id, "provider-event-1");
  assert.equal(payloads[0].batch[0].properties.distinct_id, "writer-user-17");
  assert.equal(Object.hasOwn(payloads[0].batch[0].properties, "email"), false);
});

test("Worker refuses unexpected or private properties", async () => {
  let calls = 0;
  const ok = await deliverOperationalEvent(env, { event_key: "x", account_id: 1, event_name: "account_created", payload: { authentication_method: "google", timestamp: "2026-08-12T12:00:00.000Z", schema_version: 1, title: "Private manuscript" } }, async () => { calls += 1; return { ok: true }; });
  assert.equal(ok, false);
  assert.equal(calls, 0);
});
