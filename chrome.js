import * as db from "./store.js";
import { mountFileImport } from "./importer.js";
import { trackWriterOpened } from "./analytics.js";

const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-now" viewBox="0 0 16 16"><path d="M5 3.5 11.5 8 5 12.5Z" fill="currentColor"/></symbol>
  <symbol id="i-projects" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 6.5h11M8.5 6.5v7" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-notebook" viewBox="0 0 16 16"><rect x="3.5" y="2.5" width="9" height="11" fill="none" stroke="currentColor" stroke-width="1"/><path d="M5.5 6.5h5M5.5 9.5h4" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-search" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4" fill="none" stroke="currentColor" stroke-width="1"/><path d="M9.5 9.5 13.5 13.5" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-chev" viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-close" viewBox="0 0 16 16"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-burger" viewBox="0 0 16 16"><path d="M2.5 4.5h11M2.5 8.5h11M2.5 12.5h11" fill="none" stroke="currentColor" stroke-width="1"/></symbol>
  <symbol id="i-archive" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1"/><rect x="2.5" y="2.5" width="11" height="4" fill="currentColor"/></symbol>
</svg>`;

const NAV = [
  ["now.html", "i-now", "Now"],
  ["projects.html", "i-projects", "Projects"],
  ["notebook.html", "i-notebook", "Notebook"],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function navItem([key, icon, label], current) {
  const count = key === "projects.html" ? db.projects().length
    : key === "notebook.html" ? db.allCharacters().length + db.notes().length + db.chapterNotes().length : null;
  return `<a class="nav" href="${key}"${key === current ? ' aria-current="page"' : ""}>
    <svg class="glyph" aria-hidden="true"><use href="#${icon}"/></svg>${label}
    ${count == null ? "" : `<span class="badge num">${count}</span>`}
  </a>`;
}

export function renderShell(current) {
  const today = db.todayWords();
  const goal = db.prefs().dailyGoal || 750;
  const pct = Math.min(100, Math.round((today / goal) * 100));

  document.body.insertAdjacentHTML("afterbegin", SPRITE + `
    <div class="scrim"></div>
    <div class="shell">
      <aside>
        <div class="side-top"><a href="now.html" class="wm">marze<i class="l"></i></a></div>
        <div class="side-scroll pane">
          <div class="side-group">
            <span class="lab">Writing</span>
            ${NAV.map((entry) => navItem(entry, current)).join("")}
            <button class="nav" type="button" data-open-search aria-keyshortcuts="Control+K Meta+K">
              <svg class="glyph" aria-hidden="true"><use href="#i-search"/></svg>Search
            </button>
          </div>
          <div class="side-group">
            <span class="lab">Today's goal</span>
            <div class="goal">
              <div class="goal-top"><span class="mono num">${db.fmt(today)}</span><span class="mono num">/ ${db.fmt(goal)}</span></div>
              <div class="quota"><i style="width:${pct}%"></i></div>
              <div class="goal-foot"><span class="lab">${today >= goal ? "Goal met" : today ? `${pct}% complete` : "No session"}</span></div>
            </div>
          </div>
        </div>
        <div class="side-foot">
          <a class="account-link" href="account.html" data-account-link><span class="account-name">Account &amp; backup</span><span class="account-state">Local writing</span></a>
          <div class="row"><span class="lab">Theme</span><div class="tabs theme">
            <button class="tab" data-theme-set="light">Paper</button><button class="tab" data-theme-set="dark">Ink</button><button class="tab" data-theme-set="auto">Auto</button>
          </div></div>
        </div>
      </aside>
      <div class="main"><div class="topbar">
        <div class="crumb"><button class="btn ghost tiny" id="burger" aria-label="Menu"><svg class="glyph" aria-hidden="true"><use href="#i-burger"/></svg></button><h1 id="page-title"></h1><span class="lab" id="page-count"></span></div>
        <div class="acts" id="page-acts"></div>
      </div><main class="page" id="page"></main></div>
    </div>
    <div class="search-dialog" id="global-search" hidden>
      <div class="search-backdrop" data-search-close></div>
      <section class="search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title">
        <div class="search-head"><span class="lab solid" id="search-title">Search</span><button class="btn ghost tiny" data-search-close>Close</button></div>
        <div class="search-input"><svg class="glyph" aria-hidden="true"><use href="#i-search"/></svg><input id="global-q" type="search" placeholder="Search projects and writing" autocomplete="off" spellcheck="false"></div>
        <div class="global-results pane" id="global-results"></div>
      </section>
    </div>`);

  mountSearch();
  mountFileImport();
  trackWriterOpened();
}

function mountSearch() {
  const modal = document.getElementById("global-search");
  const input = document.getElementById("global-q");
  const results = document.getElementById("global-results");
  let opener = null;
  let debounce = null;

  const render = () => {
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = `<div class="search-empty"><p>Find projects, chapters, notes and characters. Start with two letters.</p></div>`;
      return;
    }
    const hits = db.search(q);
    if (!hits.length) {
      results.innerHTML = `<div class="search-empty"><span class="lab">No match</span><p>Nothing matches “${esc(q)}”.</p></div>`;
      return;
    }
    results.innerHTML = hits.slice(0, 12).map((h) => `<a class="global-hit" href="${h.href}">
      <span class="hit-kind">${esc(h.kind)}</span><span class="global-hit-main"><b>${esc(h.title)}</b><small>${esc(h.where)}${h.context ? ` · ${esc(h.context)}` : ""}</small></span><svg class="glyph" aria-hidden="true"><use href="#i-chev"/></svg>
    </a>`).join("");
  };
  const close = () => { modal.hidden = true; input.value = ""; results.innerHTML = ""; opener?.focus(); };
  const open = (value = "") => { opener = document.activeElement; modal.hidden = false; input.value = value; render(); setTimeout(() => input.focus(), 0); };

  document.querySelectorAll("[data-open-search]").forEach((b) => b.addEventListener("click", () => open()));
  document.querySelectorAll("[data-search-close]").forEach((b) => b.addEventListener("click", close));
  input.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(render, 120); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (modal.hidden) open(); }
  });
  const initial = new URLSearchParams(location.search).get("q");
  if (initial) open(initial);
}

export function setHead(title, count = "") {
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-count").textContent = count;
}

export const page = () => document.getElementById("page");
export const acts = () => document.getElementById("page-acts");
export { esc };
