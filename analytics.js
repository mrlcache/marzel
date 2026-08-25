import { analyticsConfig } from "./analytics-config.js";

export const ANALYTICS_SCHEMA_VERSION = 1;
const ACQUISITION_KEY = "marzel:analytics:acquisition:v1";
const USER_KEY = "marzel:analytics:user:v1";
const CLOUD_KEY = "marzel:analytics:cloud:v1";
const OPTOUT_KEY = "marzel:analytics:opt-out:v1";
const MAX_STRING_LENGTH = 120;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const SAFE_SYSTEM_PROPERTIES = new Set(["token", "distinct_id", "$time", "$config_defaults", "$insert_id", "$lib", "$lib_version", "$device_id", "$session_id", "$window_id", "$had_persisted_distinct_id"]);

const EVENT_PROPERTIES = Object.freeze({
  landing_view: new Set([...UTM_KEYS, "referrer_origin", "landing_path", "environment", "app_version", "schema_version"]),
  writer_opened: new Set([...UTM_KEYS, "navigation_source", "user_state", "environment", "app_version", "schema_version"]),
  project_created: new Set(["analytics_project_id", "project_type", "storage_type", "user_state", "project_origin", "environment", "app_version", "schema_version"]),
  meaningful_writing: new Set(["analytics_project_id", "analytics_session_id", "active_seconds", "words_added", "words_removed", "storage_type", "project_type", "user_state", "environment", "app_version", "schema_version"]),
  writing_session_ended: new Set(["analytics_project_id", "analytics_session_id", "active_seconds", "words_added", "words_removed", "net_word_change", "meaningful_writing_reached", "storage_type", "project_type", "user_state", "environment", "app_version", "schema_version"]),
  manuscript_imported: new Set(["format", "word_count_band", "project_type", "storage_type", "user_state", "environment", "app_version", "schema_version"]),
  export_completed: new Set(["format", "project_type", "storage_type", "user_state", "environment", "app_version", "schema_version"]),
});

const storage = () => {
  try { return globalThis.localStorage; } catch { return null; }
};
const readJson = (key, fallback = null) => {
  try { const raw = storage()?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { storage()?.setItem(key, JSON.stringify(value)); } catch {}
};
const readText = (key) => {
  try { return storage()?.getItem(key) || ""; } catch { return ""; }
};
const writeText = (key, value) => {
  try { storage()?.setItem(key, value); } catch {}
};

const plain = (value) => typeof value === "string" && value.length <= MAX_STRING_LENGTH && /^[a-zA-Z0-9 ._:/+\-]*$/.test(value);
const safeId = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}[a-zA-Z0-9_-]{6,80}$`).test(value);
const safeEnum = (value, values) => values.includes(value);
const numeric = (value) => Number.isInteger(value) && value >= 0 && value <= 10_000_000;

function validProperty(key, value) {
  if (key === "schema_version") return value === ANALYTICS_SCHEMA_VERSION;
  if (["active_seconds", "words_added", "words_removed", "net_word_change"].includes(key)) return numeric(value) || (key === "net_word_change" && Number.isInteger(value) && Math.abs(value) <= 10_000_000);
  if (key === "meaningful_writing_reached") return typeof value === "boolean";
  if (key === "analytics_project_id") return safeId(value, "ap-");
  if (key === "analytics_session_id") return safeId(value, "ws-");
  if (key === "user_state") return safeEnum(value, ["anonymous", "registered"]);
  if (key === "storage_type") return safeEnum(value, ["local", "cloud"]);
  if (key === "project_type") return safeEnum(value, ["book", "script", "story", "essay", "mixed"]);
  if (key === "project_origin") return safeEnum(value, ["new", "imported"]);
  if (key === "navigation_source") return safeEnum(value, ["landing", "internal", "external", "direct"]);
  if (key === "format") return safeEnum(value, ["txt", "md", "markdown", "rtf", "docx", "odt", "fdx", "fountain", "zip", "mixed", "html", "pdf", "archive"]);
  if (key === "word_count_band") return safeEnum(value, ["0", "1-999", "1000-9999", "10000-49999", "50000+"]);
  if (key === "environment") return safeEnum(value, ["development", "preview", "production", "test"]);
  return plain(value);
}

function safePath(value) {
  const path = String(value || "/").split("?")[0].split("#")[0];
  return /^\/[a-zA-Z0-9._/-]{0,120}$/.test(path) ? path : "/";
}

function referrerOrigin(value) {
  if (!value) return "direct";
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.origin.slice(0, MAX_STRING_LENGTH) : "direct";
  } catch { return "direct"; }
}

function safeUtm(value) {
  const normalized = String(value || "").trim().slice(0, MAX_STRING_LENGTH);
  return /^[a-zA-Z0-9._~\-+ ]*$/.test(normalized) ? normalized : "";
}

export function acquisitionFromLocation(locationLike = globalThis.location, referrer = globalThis.document?.referrer || "") {
  const query = new URLSearchParams(locationLike?.search || "");
  const utms = Object.fromEntries(UTM_KEYS.map((key) => [key, safeUtm(query.get(key))]).filter(([, value]) => value));
  return { ...utms, referrer_origin: referrerOrigin(referrer), landing_path: safePath(locationLike?.pathname) };
}

export function persistAcquisition(locationLike = globalThis.location, referrer = globalThis.document?.referrer || "") {
  const current = acquisitionFromLocation(locationLike, referrer);
  const saved = readJson(ACQUISITION_KEY, null);
  const hasUtm = UTM_KEYS.some((key) => current[key]);
  if (!saved) {
    const initial = { first_touch: current, last_touch: current };
    writeJson(ACQUISITION_KEY, initial);
    return initial;
  }
  if (hasUtm) {
    const next = { ...saved, last_touch: { ...current, referrer_origin: current.referrer_origin || saved.last_touch?.referrer_origin || "direct" } };
    writeJson(ACQUISITION_KEY, next);
    return next;
  }
  return saved;
}

export const currentAcquisition = () => readJson(ACQUISITION_KEY, null)?.last_touch || {};
export const userState = () => readText(USER_KEY) ? "registered" : "anonymous";
export const storageType = () => readText(CLOUD_KEY) === "1" ? "cloud" : "local";
export const markCloudEnabled = () => writeText(CLOUD_KEY, "1");

export function wordCountBand(count) {
  const value = Math.max(0, Number(count) || 0);
  if (!value) return "0";
  if (value < 1000) return "1-999";
  if (value < 10000) return "1000-9999";
  if (value < 50000) return "10000-49999";
  return "50000+";
}

export function projectAnalyticsId(project) {
  return project?.analyticsId || "";
}

function defaultAdapter() {
  return globalThis.posthog || null;
}

export function createAnalytics({ config = analyticsConfig, adapter = defaultAdapter, loadSdk = null } = {}) {
  const configured = Boolean(config.enabled && config.posthogApiKey);
  let optedOut = readText(OPTOUT_KEY) === "1";
  const pending = [];
  let initialized = false;
  let sdk = null;

  const baseProperties = () => ({ environment: config.environment, app_version: config.appVersion, schema_version: ANALYTICS_SCHEMA_VERSION });
  const beforeSend = (event) => {
    if (!event?.properties) return null;
    if (event.event === "$identify") {
      event.properties = Object.fromEntries(Object.entries(event.properties).filter(([key]) => SAFE_SYSTEM_PROPERTIES.has(key) || key === "$anon_distinct_id"));
      return event;
    }
    const allowed = EVENT_PROPERTIES[event.event];
    if (!allowed) return null;
    const next = {};
    for (const [key, value] of Object.entries(event.properties)) {
      if ((allowed.has(key) && validProperty(key, value)) || SAFE_SYSTEM_PROPERTIES.has(key)) next[key] = value;
    }
    event.properties = next;
    return event;
  };
  const sdkOptions = {
    api_host: config.posthogApiHost,
    defaults: "2026-05-30",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    enable_recording_console_log: false,
    logs: { captureConsoleLogs: false },
    property_denylist: ["$current_url", "$pathname", "$referrer", "$referring_domain", "$search_engine", "$initial_referrer", "$initial_referring_domain"],
    mask_all_text: true,
    mask_all_element_attributes: true,
    cross_subdomain_cookie: true,
    respect_dnt: true,
    advanced_disable_flags: true,
    before_send: beforeSend,
  };

  const flush = () => {
    if (!sdk) return;
    while (pending.length) {
      const [event, properties, insertId, transportOptions] = pending.shift();
      try { sdk.capture(event, { ...properties, $insert_id: insertId }, transportOptions); } catch {}
    }
  };

  const init = async () => {
    if (!configured || optedOut || initialized) return Boolean(sdk);
    initialized = true;
    try {
      sdk = adapter();
      if (!sdk && loadSdk) {
        sdk = await loadSdk(config, sdkOptions);
        flush();
        return Boolean(sdk);
      }
      if (!sdk || typeof sdk.init !== "function") return false;
      sdk.init(config.posthogApiKey, sdkOptions);
      flush();
      return true;
    } catch { return false; }
  };

  const capture = (event, properties = {}, insertId = cryptoSafeId("ev-"), transportOptions = undefined) => {
    const allowed = EVENT_PROPERTIES[event];
    const combined = { ...properties, ...baseProperties() };
    if (!allowed || Object.keys(combined).some((key) => !allowed.has(key) || !validProperty(key, combined[key]))) return false;
    if (!configured || optedOut) return false;
    if (sdk?.capture) {
      try { sdk.capture(event, { ...combined, $insert_id: insertId }, transportOptions); return true; } catch { return false; }
    }
    if (pending.length < 50) pending.push([event, combined, insertId, transportOptions]);
    void init();
    return true;
  };

  const identify = (accountId) => {
    if (!/^\d{1,20}$/.test(String(accountId))) return false;
    const distinctId = `writer-user-${accountId}`;
    writeText(USER_KEY, distinctId);
    if (!configured || optedOut) return false;
    const run = () => { try { sdk?.identify?.(distinctId); } catch {} };
    if (sdk) run(); else void init().then(run);
    return true;
  };

  const reset = () => {
    try { storage()?.removeItem(USER_KEY); } catch {}
    if (!configured || optedOut) return false;
    try { sdk?.reset?.(true); return true; } catch { return false; }
  };

  const optOut = () => {
    writeText(OPTOUT_KEY, "1");
    optedOut = true;
    try { document.cookie = "marzel_analytics_opt_out=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure"; } catch {}
    try { sdk?.opt_out_capturing?.(); } catch {}
  };

  return { init, capture, identify, reset, optOut, beforeSend, isEnabled: () => configured && !optedOut, isOptedOut: () => optedOut };
}

function cryptoSafeId(prefix) {
  try { return `${prefix}${crypto.randomUUID()}`; } catch { return `${prefix}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
}

function loadPostHogScript(config, options) {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (globalThis.posthog) return Promise.resolve(globalThis.posthog);
  return new Promise((resolve) => {
    const posthog = [];
    posthog._i = [];
    posthog.people = [];
    posthog.toString = () => "posthog (stub)";
    posthog.people.toString = () => "posthog (stub).people";
    "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetGroupPropertiesForFlags resetPersonPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug"
      .split(" ").forEach((method) => {
        if (method === "init") return;
        posthog[method] = (...args) => posthog.push([method, ...args]);
      });
    posthog.init = (token, initOptions, name) => posthog._i.push([token, initOptions, name]);
    posthog.__SV = 1;
    globalThis.posthog = posthog;
    posthog.init(config.posthogApiKey, options);
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `${analyticsConfig.posthogApiHost.replace(/\/$/, "").replace(".i.posthog.com", "-assets.i.posthog.com")}/static/array.js`;
    script.onload = () => resolve(globalThis.posthog || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export const analytics = createAnalytics({ loadSdk: loadPostHogScript });
void analytics.init();

const utmsOnly = (value) => Object.fromEntries(UTM_KEYS.map((key) => [key, value?.[key]]).filter(([, item]) => item));

export function trackLandingView() {
  const acquisition = persistAcquisition();
  return analytics.capture("landing_view", { ...acquisition.last_touch, landing_path: acquisition.last_touch?.landing_path || "/" });
}

export function trackWriterOpened() {
  const referrer = referrerOrigin(globalThis.document?.referrer || "");
  const navigation_source = referrer === "direct" ? "direct" : referrer === globalThis.location?.origin ? "internal" : /marzel\.space$/i.test(referrer) ? "landing" : "external";
  persistAcquisition();
  return analytics.capture("writer_opened", { ...utmsOnly(currentAcquisition()), navigation_source, user_state: userState() }, undefined, { send_instantly: true });
}

export function trackProjectCreated(project, project_origin) {
  return analytics.capture("project_created", { analytics_project_id: projectAnalyticsId(project), project_type: project.kind, storage_type: storageType(), user_state: userState(), project_origin }, undefined, { send_instantly: true });
}

export function trackImport({ format, wordCount, project }) {
  return analytics.capture("manuscript_imported", { format, word_count_band: wordCountBand(wordCount), project_type: project.kind, storage_type: storageType(), user_state: userState() });
}

export function trackExport(format, project) {
  return analytics.capture("export_completed", { format, project_type: project.kind, storage_type: storageType(), user_state: userState() });
}
