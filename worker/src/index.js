import * as db from "./db.js";
import { flushOperationalEvents } from "./analytics.js";

const SESSION_COOKIE = "marzel_writer_session";
const OAUTH_COOKIE = "marzel_writer_oauth";
const ANALYTICS_OPTOUT_COOKIE = "marzel_analytics_opt_out";
const DAY = 60 * 60 * 24;
const encoder = new TextEncoder();

const base64url = (value) => btoa(String.fromCharCode(...new Uint8Array(value)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const decode = (value) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
const jsonPart = (value) => JSON.parse(new TextDecoder().decode(decode(value)));
const hash = async (value, secret) => base64url(await crypto.subtle.digest("SHA-256", encoder.encode(`${secret}:${value}`)));
const cookies = (request) => Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => part.trim().split(/=(.*)/, 2)).filter(([key]) => key));
const secure = (request) => new URL(request.url).protocol === "https:" ? "; Secure" : "";
const cookie = (request, name, value, age = DAY, sameSite = "Lax") => `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${age}${secure(request)}`;
const clearCookie = (request, name) => cookie(request, name, "", 0);
const headers = (request, extra = {}) => ({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra });
const response = (request, body, status = 200, extra) => new Response(JSON.stringify(body), { status, headers: headers(request, extra) });
const failure = (request, error, status = 400) => response(request, { error }, status);
const origin = (request, env) => (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
const redirect = (url, setCookie = []) => {
  const headers = new Headers({ location: url });
  (Array.isArray(setCookie) ? setCookie : [setCookie]).filter(Boolean).forEach((value) => headers.append("set-cookie", value));
  return new Response(null, { status: 302, headers });
};

const config = (env) => Boolean(env.DATABASE_URL && env.SESSION_SECRET && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const analyticsAllowed = (request) => cookies(request)[ANALYTICS_OPTOUT_COOKIE] !== "1" && request.headers.get("dnt") !== "1";
const analyticsKey = (event, accountId, suffix) => `marzel:${event}:${accountId}:${suffix}`;
const projectType = (data) => {
  const types = [...new Set((data?.projects || []).map((project) => project?.kind).filter((kind) => ["book", "script", "story", "essay"].includes(kind)))];
  return types.length === 1 ? types[0] : "mixed";
};
const enqueue = (sql, input) => db.enqueueOperationalEvent(sql, input).catch(() => false);

async function verifiedJwt(token, issuer, audience, nonce, jwksUrl) {
  const [rawHeader, rawPayload, rawSignature] = String(token || "").split(".");
  if (!rawSignature) throw new Error("bad_token");
  const header = jsonPart(rawHeader);
  const claims = jsonPart(rawPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad_algorithm");
  const keys = await fetch(jwksUrl).then((result) => result.json());
  const jwk = keys.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("unknown_key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(rawSignature), encoder.encode(`${rawHeader}.${rawPayload}`));
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!verified || claims.iss !== issuer || !audiences.includes(audience) || Number(claims.exp) < Date.now() / 1000 || claims.nonce !== nonce) throw new Error("unverified_token");
  return claims;
}

async function currentAccount(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || !env.DATABASE_URL || !env.SESSION_SECRET) return null;
  return db.sessionAccount(db.connect(env), await hash(token, env.SESSION_SECRET));
}

function oauthData(request) {
  try { return JSON.parse(decodeURIComponent(cookies(request)[OAUTH_COOKIE] || "")); } catch { return null; }
}

async function startOAuth(request, env) {
  if (!config(env)) return failure(request, "auth_not_configured", 503);
  const state = random(); const nonce = random(); const callback = `${origin(request, env)}/api/auth/google/callback`;
  const stateCookie = cookie(request, OAUTH_COOKIE, encodeURIComponent(JSON.stringify({ state, nonce, expires: Date.now() + 10 * 60 * 1000 })), 600);
  const query = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`, stateCookie);
}

async function finishOAuth(request, env, ctx) {
  const input = Object.fromEntries(new URL(request.url).searchParams);
  const saved = oauthData(request);
  const done = (state) => redirect(`${origin(request, env)}/account.html?auth=${state}`, clearCookie(request, OAUTH_COOKIE));
  if (!saved || saved.state !== input.state || saved.expires < Date.now() || !input.code) return done("failed");
  try {
    const callback = `${origin(request, env)}/api/auth/google/callback`;
    const tokenBody = new URLSearchParams({ code: input.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: "authorization_code" });
    const tokens = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenBody }).then((result) => result.ok ? result.json() : Promise.reject(new Error("token_exchange")));
    const claims = await verifiedJwt(tokens.id_token, "https://accounts.google.com", env.GOOGLE_CLIENT_ID, saved.nonce, "https://www.googleapis.com/oauth2/v3/certs");
    if (claims.email_verified !== true) throw new Error("unverified_email");
    const profile = { provider: "google", subject: claims.sub, email: claims.email, name: claims.name };
    const sql = db.connect(env); const user = await db.upsertAccount(sql, profile); const token = random(); await db.createSession(sql, user.id, await hash(token, env.SESSION_SECRET));
    if (user.created && analyticsAllowed(request)) await enqueue(sql, {
      eventKey: analyticsKey("account_created", user.id, String(user.id)), accountId: user.id, eventName: "account_created",
      payload: { authentication_method: "google", timestamp: new Date().toISOString(), schema_version: 1 },
    });
    ctx?.waitUntil?.(flushOperationalEvents(env, sql).catch(() => 0));
    return redirect(`${origin(request, env)}/account.html?auth=connected`, [clearCookie(request, OAUTH_COOKIE), cookie(request, SESSION_COOKIE, token, DAY * 30)]);
  } catch (error) { console.error("OAuth failed", error instanceof Error ? error.message : "unknown"); return done("failed"); }
}

async function stateRoute(request, env, account, ctx) {
  const sql = db.connect(env);
  if (request.method === "GET") return response(request, await db.stateFor(sql, account.id) || { data: null, revision: null, updatedAt: null });
  const raw = await request.text();
  if (raw.length > 5 * 1024 * 1024) return failure(request, "state_too_large", 413);
  let body; try { body = JSON.parse(raw); } catch { return failure(request, "bad_json"); }
  if (!body?.data || !Array.isArray(body.data.projects) || !Array.isArray(body.data.notes) || typeof body.data.history !== "object") return failure(request, "invalid_state");
  const saved = await db.saveState(sql, account.id, body.data, Number.isInteger(body.revision) ? body.revision : null);
  if (!saved.conflict && saved.created && analyticsAllowed(request)) {
    await enqueue(sql, {
      eventKey: analyticsKey("cloud_enabled", account.id, String(saved.revision)), accountId: account.id, eventName: "cloud_enabled",
      payload: { projects_migrated: Math.max(0, body.data.projects.length), project_type: projectType(body.data), activation_origin: "backup", schema_version: 1 },
    });
    ctx?.waitUntil?.(flushOperationalEvents(env, sql).catch(() => 0));
  }
  return saved.conflict ? response(request, { error: "state_conflict", ...saved.current }, 409) : response(request, saved);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    try {
      if (env.DATABASE_URL) {
        const sql = db.connect(env);
        await db.ensureSchema(sql);
        ctx?.waitUntil?.(flushOperationalEvents(env, sql).catch(() => 0));
      }
      if (path === "/api/health") return response(request, { ok: true });
      if (path === "/api/auth/google" && request.method === "GET") return startOAuth(request, env);
      if (path === "/api/auth/google/callback" && request.method === "GET") return finishOAuth(request, env, ctx);
      const account = await currentAccount(request, env);
      if (path === "/api/auth/me" && request.method === "GET") return account ? response(request, account) : failure(request, "unauthenticated", 401);
      if (path === "/api/auth/session" && request.method === "DELETE") {
        if (account) await db.deleteSession(db.connect(env), await hash(cookies(request)[SESSION_COOKIE], env.SESSION_SECRET));
        return response(request, { ok: true }, 200, { "set-cookie": clearCookie(request, SESSION_COOKIE) });
      }
      if (path === "/api/writer/state" && (request.method === "GET" || request.method === "PUT")) return account ? stateRoute(request, env, account, ctx) : failure(request, "unauthenticated", 401);
      return failure(request, "not_found", 404);
    } catch (error) { console.error("Writer API", error instanceof Error ? error.message : "unknown"); return failure(request, "service_unavailable", 503); }
  },
};
