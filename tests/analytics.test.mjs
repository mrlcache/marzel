import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const {
  ANALYTICS_SCHEMA_VERSION,
  acquisitionFromLocation,
  createAnalytics,
  persistAcquisition,
} = await import("../analytics.js");
const { WritingSessionTracker } = await import("../writing-session.js");

const enabledConfig = { enabled: true, posthogApiKey: "phc_test", posthogApiHost: "https://us.i.posthog.com", environment: "test", appVersion: "test" };

test("analytics emits only allow-listed properties and never sends manuscript strings", async () => {
  const events = [];
  const sdk = { init() {}, capture(event, properties) { events.push({ event, properties }); } };
  const client = createAnalytics({ config: enabledConfig, adapter: () => sdk });
  await client.init();
  assert.equal(client.capture("project_created", {
    analytics_project_id: "ap-12345678", project_type: "book", storage_type: "local", user_state: "anonymous", project_origin: "new",
  }, "one"), true);
  assert.equal(events.length, 1);
  assert.equal(events[0].properties.title, undefined);
  assert.equal(events[0].properties.manuscript, undefined);
  assert.equal(client.capture("project_created", {
    analytics_project_id: "ap-12345678", project_type: "book", storage_type: "local", user_state: "anonymous", project_origin: "new", title: "Private novel",
  }), false);
  const filtered = client.beforeSend({ event: "project_created", properties: { ...events[0].properties, token: "phc_test", distinct_id: "anonymous-id", $time: 123, $current_url: "https://marzel.space/editor.html?p=private" } });
  assert.equal(filtered.properties.$current_url, undefined);
  assert.equal(filtered.properties.token, "phc_test");
  assert.equal(filtered.properties.distinct_id, "anonymous-id");
  assert.equal(filtered.properties.$time, 123);
  assert.equal(ANALYTICS_SCHEMA_VERSION, 1);
});

test("disabled analytics is a no-op and identity is reset on logout", async () => {
  let captures = 0;
  let identified = "";
  let reset = false;
  const sdk = { init() {}, capture() { captures += 1; }, identify(value) { identified = value; }, reset(value) { reset = value; } };
  const disabled = createAnalytics({ config: { ...enabledConfig, enabled: false }, adapter: () => sdk });
  assert.equal(disabled.capture("landing_view", { landing_path: "/", referrer_origin: "direct" }), false);
  assert.equal(captures, 0);
  const enabled = createAnalytics({ config: enabledConfig, adapter: () => sdk });
  await enabled.init();
  assert.equal(enabled.identify("42"), true);
  assert.equal(identified, "writer-user-42");
  assert.equal(enabled.reset(), true);
  assert.equal(reset, true);
});

test("the browser integration loads PostHog through its queue bootstrap", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../analytics.js", import.meta.url), "utf8");
  assert.match(source, /posthog\._i = \[\]/);
  assert.match(source, /globalThis\.posthog = posthog/);
  assert.match(source, /posthog\.init = \(token, initOptions, name\)/);
  assert.match(source, /posthog\.people = \[\]/);
  assert.match(source, /posthog\.__SV = 1/);
  assert.match(source, /posthog\.init\(config\.posthogApiKey, options\)/);
});

test("UTMs persist from landing to Writer without storing a URL", () => {
  memory.clear();
  const first = persistAcquisition({ search: "?utm_source=tiktok&utm_campaign=chapter-1", pathname: "/" }, "https://www.tiktok.com/@marzel/video/123");
  const later = persistAcquisition({ search: "", pathname: "/editor.html" }, "");
  assert.equal(first.first_touch.utm_source, "tiktok");
  assert.equal(later.last_touch.utm_campaign, "chapter-1");
  assert.equal(later.first_touch.referrer_origin, "https://www.tiktok.com");
  assert.equal(Object.hasOwn(later.first_touch, "url"), false);
  assert.equal(acquisitionFromLocation({ search: "?utm_source=<private text>", pathname: "/?private" }).utm_source, undefined);
});

test("meaningful writing fires once, idle time is excluded, and a 30-minute gap splits sessions", () => {
  let now = 0;
  let visible = true;
  let focused = true;
  const events = [];
  const tracker = new WritingSessionTracker({
    now: () => now,
    visible: () => visible,
    focused: () => focused,
    context: () => ({ analytics_project_id: "ap-12345678", storage_type: "local", project_type: "book", user_state: "anonymous" }),
    capture: (event, properties, insertId) => events.push({ event, properties, insertId }),
  });
  tracker.recordChange({ beforeWords: 0, afterWords: 10 });
  now = 30_000; tracker.tick();
  now = 120_000; tracker.tick();
  assert.equal(events.filter((entry) => entry.event === "meaningful_writing").length, 0, "idle 90 seconds must not count");
  now = 121_000; tracker.recordChange({ beforeWords: 10, afterWords: 60 });
  assert.equal(events.filter((entry) => entry.event === "meaningful_writing").length, 1);
  now = 122_000; tracker.recordChange({ beforeWords: 60, afterWords: 70 });
  assert.equal(events.filter((entry) => entry.event === "meaningful_writing").length, 1, "only once per session");
  visible = false; now = 150_000; tracker.tick(); visible = true;
  now = 1_922_001; tracker.recordChange({ beforeWords: 70, afterWords: 71 });
  assert.equal(events.filter((entry) => entry.event === "writing_session_ended").length, 1);
  assert.notEqual(tracker.session.id, events.find((entry) => entry.event === "writing_session_ended").properties.analytics_session_id);
  focused = false; now += 30_000; tracker.tick();
  assert.equal(tracker.session.activeMs, 0, "unfocused time is not counted in the new session");
});
