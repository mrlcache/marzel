import { analytics } from "./analytics.js";

const REQUEST_TIMEOUT = 4500;
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(`/api${path}`, { credentials: "same-origin", ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
let cached = undefined;
let pending = null;

async function read(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed."), { status: response.status, data });
  return data;
}

export async function account(refresh = false) {
  if (cached !== undefined && !refresh) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      cached = await read(await api("/auth/me"));
      if (cached?.id != null) analytics.identify(String(cached.id));
    }
    catch { cached = null; }
    finally { pending = null; }
    return cached;
  })();
  return pending;
}

function drawAccountLinks(user) {
  document.querySelectorAll("[data-account-link]").forEach((link) => {
    const name = link.querySelector(".account-name");
    const state = link.querySelector(".account-state");
    if (user) {
      name.textContent = user.name || user.email;
      state.textContent = "Cloud backup on";
    } else {
      name.textContent = "Account & backup";
      state.textContent = "Local writing";
    }
  });
}

export function mountAccount() {
  account().then(drawAccountLinks);
}

export function beginSignIn(provider) {
  location.assign(`/api/auth/${provider}`);
}

export async function signOut() {
  await read(await api("/auth/session", { method: "DELETE" }));
  analytics.reset();
  cached = null;
  drawAccountLinks(null);
}

export async function cloudState() {
  return read(await api("/writer/state"));
}

export async function saveCloudState(data, revision = null) {
  return read(await api("/writer/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data, revision }),
  }));
}
