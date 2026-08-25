const EVENT_NAMES = new Set(["account_created", "cloud_enabled", "subscription_started", "subscription_renewed", "subscription_cancelled", "payment_failed"]);

const validPayload = (event, properties) => {
  if (!EVENT_NAMES.has(event) || !properties || typeof properties !== "object" || Array.isArray(properties)) return false;
  const allowed = event === "account_created"
    ? new Set(["authentication_method", "timestamp", "schema_version"])
    : event === "cloud_enabled"
      ? new Set(["projects_migrated", "project_type", "activation_origin", "schema_version"])
      : new Set(["plan", "billing_interval", "currency", "amount", "schema_version"]);
  return Object.entries(properties).every(([key, value]) => {
    if (!allowed.has(key)) return false;
    if (key === "schema_version") return value === 1;
    if (key === "projects_migrated" || key === "amount") return Number.isFinite(value) && value >= 0;
    if (key === "billing_interval") return ["monthly", "annual"].includes(value);
    if (key === "project_type") return ["book", "script", "story", "essay", "mixed"].includes(value);
    if (key === "activation_origin") return ["backup", "migration"].includes(value);
    if (key === "authentication_method") return value === "google";
    if (key === "currency") return /^[A-Z]{3}$/.test(value);
    if (key === "timestamp") return /^\d{4}-\d\d-\d\dT/.test(value);
    return typeof value === "string" && /^[a-zA-Z0-9._ -]{1,80}$/.test(value);
  });
};

export async function deliverOperationalEvent(env, row, fetchImpl = fetch) {
  if (env.ANALYTICS_ENABLED !== "true" || !env.POSTHOG_PROJECT_API_KEY || !validPayload(row.event_name, row.payload)) return false;
  const host = (env.POSTHOG_API_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetchImpl(`${host}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: env.POSTHOG_PROJECT_API_KEY,
        batch: [{ event: row.event_name, properties: { ...row.payload, distinct_id: `writer-user-${row.account_id}`, $insert_id: row.event_key } }],
      }),
    });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

export async function flushOperationalEvents(env, sql, fetchImpl = fetch) {
  if (env.ANALYTICS_ENABLED !== "true" || !env.POSTHOG_PROJECT_API_KEY) return 0;
  const rows = await sql`
    select event_key, account_id, event_name, payload
    from writer_analytics_outbox
    where delivered_at is null
    order by created_at asc
    limit 20
  `;
  let delivered = 0;
  for (const row of rows) {
    if (await deliverOperationalEvent(env, row, fetchImpl)) {
      await sql`update writer_analytics_outbox set delivered_at = now() where event_key = ${row.event_key} and delivered_at is null`;
      delivered += 1;
    }
  }
  return delivered;
}
