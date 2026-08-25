import * as db from "./store.js";
import { mount } from "./shell.js";
import { renderShell, setHead, page, acts, esc } from "./chrome.js";

renderShell("now.html");
setHead("Now");
acts().innerHTML = `<a class="btn ghost" href="account.html">Account &amp; backup</a><a class="btn ghost" href="projects.html">Projects</a>`;

const editorHref = (p, c) => `editor.html?p=${encodeURIComponent(p.id)}&c=${encodeURIComponent(c.id)}`;
const edited = (ts) => db.editedLabel(ts);
const NOW_PREVIEW_LIMIT = 4;
const LARGE_DEMO_TITLE = "Long-form layout test";
const recent = () => db.projects()
  .flatMap((project) => project.chapters.map((chapter) => ({ project, chapter })))
  .sort((a, b) => b.chapter.updated - a.chapter.updated);
const chapterLabel = (project, chapter) => `${project.kind === "script" ? "Scene" : "Chapter"} ${String(project.chapters.findIndex((item) => item.id === chapter.id) + 1).padStart(2, "0")}`;

function ensureLargeDemo() {
  const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!localHost && new URLSearchParams(location.search).get("demo") !== "large") return;
  if (db.projects().some((project) => project.title === LARGE_DEMO_TITLE)) return;
  const paragraphs = Array.from({ length: 64 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `Paragraph ${number} follows the archive corridor as the morning changes. The room keeps its own weather: dust settles on the brass drawers, the windows hold a pale line of winter, and every label seems to promise a story that will take longer than one sitting. Mara writes down what she can verify, then writes down what she cannot, because both kinds of detail will matter when the first explanation begins to fail.`;
  });
  db.createImportedProject({
    title: LARGE_DEMO_TITLE,
    kind: "book",
    chapters: [{
      title: "Chapter 1 — The Long Archive Room",
      text: `# The Long Archive Room\n\n${paragraphs.join("\n\n")}`,
    }],
  });
}

function week() {
  const history = db.load().history;
  const day = 86400000;
  const now = Date.now();
  const values = Array.from({ length: 7 }, (_, index) => history[db.dayKey(now - day * (6 - index))] || 0);
  return { values, total: values.reduce((sum, value) => sum + value, 0), days: values.filter(Boolean).length };
}

function render() {
  const projects = db.projects();
  const drafts = db.draftChapters();
  const items = drafts.length ? drafts : recent();
  const current = items[0];
  const today = db.todayWords();
  const goal = db.prefs().dailyGoal || 750;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const streak = db.streak();
  const weekly = week();
  const weekMax = Math.max(...weekly.values, goal, 1);

  if (!current) {
    page().innerHTML = `<section class="now-hero"><div><span class="lab eyebrow">Start a manuscript</span><h2>Make a place for the thing you want to write.</h2><p>A project keeps its chapters, notes and people together. You can change the goal later.</p></div><a class="btn" href="projects.html?new=1">New project</a></section>`;
    return;
  }

  const { project, chapter } = current;
  const excerpt = (chapter.text || "").split("\n")
    .find((line) => line.trim() && !line.trim().startsWith("#"))?.trim() || "";
  page().innerHTML = `
    <section class="now-hero">
      <div>
        <span class="lab eyebrow">${drafts.length ? "Continue writing" : "Last touched"}</span>
        <h2>${esc(project.title)}</h2>
        ${excerpt ? `<p class="now-excerpt">“${esc(excerpt.slice(0, 180))}${excerpt.length > 180 ? "…" : ""}”</p>` : ""}
        <p>${esc(chapterLabel(project, chapter))} · ${db.fmt(db.words(chapter.text))} words · ${db.STATUSES[chapter.status]}</p>
      </div>
      <a class="btn" href="${editorHref(project, chapter)}">Continue <svg class="glyph" aria-hidden="true"><use href="#i-chev"/></svg></a>
    </section>
    <div class="now-grid">
      <section class="now-section" id="next-up">
        <div class="now-section-head"><div><span class="lab">Next up</span><h2>${drafts.length ? "Drafts that need your attention" : "Recent chapters"}</h2></div><a class="mono" href="projects.html">${items.length > NOW_PREVIEW_LIMIT ? `${items.length - NOW_PREVIEW_LIMIT} more · all projects` : "All projects"}</a></div>
        <div class="continue-list">${items.slice(0, NOW_PREVIEW_LIMIT).map(({ project: p, chapter: c }) => `<article class="continue-row"><a class="continue-open" href="${editorHref(p, c)}"><span><b>${esc(p.title)}</b><small>${esc(chapterLabel(p, c))} · ${db.STATUSES[c.status]} · ${edited(c.updated)}</small></span></a></article>`).join("")}</div>
      </section>
      <section class="now-section now-metrics">
        <div class="now-stat"><span class="lab">Today</span><b class="num">${db.fmt(today)} <small class="mono">/ ${db.fmt(goal)}</small></b><div class="quota"><i style="width:${pct}%"></i></div><p>${today >= goal ? "Goal met. Keep going if the page has you." : today ? `${db.fmt(goal - today)} words to your goal.` : "One sentence is enough to start the session."}</p></div>
        <div class="now-stat"><span class="lab">Streak</span><b class="num">${streak}</b><p>${streak === 1 ? "day running" : "days running"}</p></div>
        <div class="now-stat"><span class="lab">This week</span><b class="num">${db.fmt(weekly.total)}</b><div class="week-bars" aria-label="Writing over the last seven days">${weekly.values.map((value, index) => `<i class="${index === 6 ? "today" : ""}" style="height:${Math.max(3, Math.round((value / weekMax) * 100))}%" title="${db.fmt(value)} words"></i>`).join("")}</div><div class="week-foot"><span>${weekly.days}/7 writing days</span><span>7 days</span></div></div>
      </section>
    </div>
    <section class="motion-section">
      <div class="now-section-head"><div><span class="lab">Projects in motion</span><h2>Keep the work visible, not competing</h2></div><a class="mono" href="projects.html">${projects.length > 2 ? `${projects.length - 2} more · manage projects` : "Manage projects"}</a></div>
      <div class="motion-grid">${projects.sort((a, b) => b.updated - a.updated).slice(0, 2).map((p) => { const words = db.projectWords(p); const progress = Math.min(100, Math.round((words / p.target) * 100)); const last = p.chapters.reduce((latest, item) => item.updated > latest.updated ? item : latest, p.chapters[0]); return `<a class="motion-card" href="${editorHref(p, last)}"><span class="lab">${esc(db.KINDS[p.kind]?.label || p.kind)}</span><h3>${esc(p.title)}</h3><p>${esc(chapterLabel(p, last))}</p><div class="quota"><i style="width:${progress}%"></i></div><div class="motion-meta"><span><b class="num">${db.fmt(words)}</b> / ${db.fmt(p.target)}</span><span>${progress}%</span></div></a>`; }).join("")}</div>
    </section>`;

}

mount();
ensureLargeDemo();
render();
