import { mountAccount } from "./account.js";

const THEME_KEY = "marzel-theme";
let themeWipe = null;
let themeTimer = null;

export function currentTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "auto";
  } catch (e) {
    return "auto";
  }
}

export function setTheme(mode) {
  const root = document.documentElement;
  if (currentTheme() === mode) return;
  clearTimeout(themeTimer);
  themeWipe?.remove();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const apply = () => {
    root.classList.add("swap");
    if (mode === "auto") {
      root.removeAttribute("data-theme");
      try { localStorage.removeItem(THEME_KEY); } catch (e) {}
    } else {
      root.setAttribute("data-theme", mode);
      try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    }
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("swap")));
    syncThemeTabs();
  };

  if (reducedMotion) { apply(); return; }
  themeWipe = document.createElement("div");
  themeWipe.className = "theme-wipe";
  themeWipe.setAttribute("aria-hidden", "true");
  themeWipe.style.background = getComputedStyle(root).getPropertyValue("--ink");
  document.body.appendChild(themeWipe);
  const wipe = themeWipe;
  wipe.addEventListener("animationend", () => { if (themeWipe === wipe) themeWipe = null; wipe.remove(); }, { once: true });
  requestAnimationFrame(() => { if (themeWipe === wipe) wipe.classList.add("run"); });
  themeTimer = setTimeout(() => { if (themeWipe === wipe) apply(); }, 130);
}

function syncThemeTabs() {
  const mode = currentTheme();
  document.querySelectorAll("[data-theme-set]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.themeSet === mode));
  });
}

export function mountTheme() {
  document.querySelectorAll("[data-theme-set]").forEach((b) => {
    b.addEventListener("click", () => setTheme(b.dataset.themeSet));
  });
  syncThemeTabs();
}

export function mountSidebar() {
  const root = document.documentElement;
  const close = () => root.classList.remove("side-open");

  document.getElementById("burger")?.addEventListener("click", () => {
    root.classList.toggle("side-open");
  });
  document.querySelector(".scrim")?.addEventListener("click", close);
  document.querySelector("aside")?.addEventListener("click", (e) => {
    if (e.target.closest("a,button")) close();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

let toastTimer = null;

export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
}

export function confirmAction({ title, message, confirmLabel = "Delete", cancelLabel = "Keep it" } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const layer = document.createElement("div");
    layer.className = "modal confirm-modal";
    layer.innerHTML = `<section class="modal-box wipe" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-message"><div class="modal-head"><span class="lab solid">Confirm removal</span><button class="btn ghost tiny" type="button" data-confirm-cancel>Close</button></div><div class="modal-body"><h2 class="confirm-title" id="confirm-action-title"></h2><p class="confirm-copy" id="confirm-action-message"></p></div><div class="modal-foot"><button class="btn ghost" type="button" data-confirm-cancel></button><button class="btn" type="button" data-confirm-accept></button></div></section>`;
    layer.querySelector(".confirm-title").textContent = title || "Delete this item?";
    layer.querySelector(".confirm-copy").textContent = message || "This cannot be undone.";
    const cancelButtons = [...layer.querySelectorAll("[data-confirm-cancel]")];
    cancelButtons.at(-1).textContent = cancelLabel;
    layer.querySelector("[data-confirm-accept]").textContent = confirmLabel;
    document.body.appendChild(layer);

    const finish = (accepted) => {
      document.removeEventListener("keydown", onKeydown);
      layer.remove();
      if (opener instanceof HTMLElement) opener.focus();
      resolve(accepted);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); finish(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...layer.querySelectorAll("button:not([disabled])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    cancelButtons.forEach((button) => button.addEventListener("click", () => finish(false)));
    layer.querySelector("[data-confirm-accept]").addEventListener("click", () => finish(true));
    layer.addEventListener("mousedown", (event) => { if (event.target === layer) finish(false); });
    document.addEventListener("keydown", onKeydown);
    layer.querySelector("[data-confirm-cancel]").focus();
  });
}

export function mount() {
  mountTheme();
  mountSidebar();
  mountAccount();
  document.addEventListener("marzel:save-failed", () => {
    toast("Out of storage. Export and clear old projects.");
  });
}
