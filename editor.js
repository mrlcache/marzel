import * as db from "./store.js";
import { downloadProjectDocx, downloadProjectHtml, printProject } from "./exporter.js";
import { confirmAction, mountTheme, toast } from "./shell.js";
import { mountFileImport } from "./importer.js";
import { sanitizeHtml } from "./sanitize.js";
import { analytics, storageType, trackExport, userState } from "./analytics.js";
import { WritingSessionTracker } from "./writing-session.js";
import { notebookRecords as loadNotebookRecords, notebookTypeLabel } from "./notebook-data.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const qs = new URLSearchParams(location.search);
let projectId = qs.get("p");
let chapterId = qs.get("c");

let P = db.project(projectId);

if (!P) {
  const first = db.projects()[0];
  if (!first) location.replace("now.html");
  else {
    P = first;
    projectId = P.id;
    chapterId = null;
  }
}

let C = db.chapter(projectId, chapterId) || P.chapters[0];
chapterId = C.id;
db.ensureAnalyticsProjectId(projectId);
P = db.project(projectId);

let sessionBase = db.projects().reduce((n, p) => n + db.projectWords(p), 0);

const doc = $("#doc");
const titleInput = $("#chap-title");
const notes = $("#notes");
const sheet = $(".sheet");
const formatBar = $("#format-bar");
const selectionMenu = $("#selection-menu");
const selectionAction = $("#create-chapter-from-selection");
const selectionInlineActions = $$('[data-selection-inline]', selectionMenu);
const notebookDrawer = $("#editor-notebook");
const notebookBackdrop = $("#editor-notebook-backdrop");
const notebookToggle = $("#notebook-toggle");
const notebookClose = $("#notebook-close");
const notebookQueryInput = $("#notebook-query");
const notebookList = $("#editor-notebook-list");
const notebookDetail = $("#editor-notebook-detail");
let notebookFilter = "all";
let notebookQuery = "";
let notebookSelectedKey = "";

const compositionChoices = {
  font: [["serif", "Serif"], ["sans", "Sans"]],
  scale: [["compact", "Compact"], ["standard", "Standard"], ["large", "Large"]],
  measure: [["narrow", "Narrow"], ["standard", "Standard"], ["wide", "Wide"]],
  paragraphs: [["compact", "None"], ["regular", "Standard"], ["relaxed", "Deep"]],
};

let saveTimer = null;
let dirty = false;
let savedRange = null;
let editorWords = db.words(C.text);
const writingTracker = new WritingSessionTracker({
  capture: (event, properties, insertId) => analytics.capture(event, properties, insertId),
  context: () => ({ analytics_project_id: P.analyticsId, storage_type: storageType(), project_type: P.kind, user_state: userState() }),
  visible: () => document.visibilityState === "visible",
  focused: () => document.activeElement === doc || doc.contains(document.activeElement),
});

function markDirty() {
  dirty = true;
  $("#save-state").classList.add("dirty");
  $("#save-state").querySelector("span").textContent = "Editing";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commit, 700);
}

function commit() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  const stored = db.writeChapter(projectId, chapterId, {
    text: docText(),
    html: docHtml(),
    title: titleInput.value.trim(),
    notes: notes.value,
  });
  const state = $("#save-state");
  state.classList.toggle("failed", stored === false);
  if (stored === false) {
    state.classList.add("dirty");
    state.querySelector("span").textContent = "Not saved";
    state.title = "This browser is out of storage. Export your work before writing more.";
  } else {
    dirty = false;
    state.classList.remove("dirty");
    state.querySelector("span").textContent = "Saved";
    state.removeAttribute("title");
  }
  C = db.chapter(projectId, chapterId);
  titleInput.value = C.title;
  renderChapters();
  renderMeta();
  renderStats();
}

addEventListener("beforeunload", () => { writingTracker.end(); commit(); });
addEventListener("pagehide", () => writingTracker.end());
document.addEventListener("visibilitychange", () => {
  writingTracker.tick();
  if (document.visibilityState === "hidden") commit();
});
doc.addEventListener("focus", () => writingTracker.tick());
doc.addEventListener("blur", () => writingTracker.tick());

function grow() {
}

function wrapStrayText() {
  const stray = [...doc.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim());
  if (!stray.length) return;
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const offset = selection?.anchorOffset ?? 0;
  stray.forEach((node) => {
    const block = document.createElement("p");
    node.replaceWith(block);
    block.appendChild(node);
  });
  if (anchor && doc.contains(anchor)) {
    const range = document.createRange();
    range.setStart(anchor, Math.min(offset, anchor.length ?? offset));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function docText() {
  return doc.innerText.replace(/\u00a0/g, " ").replace(/\n+$/, "");
}

function docHtml() {
  return sanitizeEditorHtml(doc.innerHTML);
}

function editableHtml(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => line)) return "";
  const blocks = [];
  let paragraph = [];
  const addParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${esc(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  };
  lines.forEach((line) => {
    if (line === "") {
      if (paragraph.length) addParagraph();
      else blocks.push("<p><br></p>");
    } else paragraph.push(line);
  });
  addParagraph();
  return blocks.join("");
}

function sanitizeEditorHtml(html) {
  return sanitizeHtml(html);
}

function composition() {
  return P.composition || db.MANUSCRIPT_PROFILES[P.kind === "script" ? "script" : "prose"];
}

function applyComposition() {
  const c = composition();
  document.documentElement.setAttribute("data-face", c.profile);
  sheet.dataset.font = c.font;
  sheet.dataset.scale = c.scale;
  sheet.dataset.measure = c.measure;
  sheet.dataset.paragraphs = c.paragraphs;
  $$("#face .tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.face === c.profile)));
  $$("[data-format-font]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.formatFont === c.font)));
  formatBar.dataset.script = String(c.profile === "script");
  const locked = c.profile === "script";
  $$("[data-format-font], [data-scale-delta]").forEach((button) => { button.disabled = locked; });
}

function compositionButtons(key, label, c) {
  return `<div class="composition-group"><span class="lab">${label}</span><div class="tabs fill">${compositionChoices[key].map(([value, text]) => `<button class="tab" type="button" data-composition="${key}" data-value="${value}" aria-pressed="${c[key] === value}">${text}</button>`).join("")}</div></div>`;
}

function renderComposition() {
  const c = composition();
  const target = $("#composition");
  const profile = db.MANUSCRIPT_PROFILES[c.profile] || db.MANUSCRIPT_PROFILES.prose;
  target.innerHTML = `<div class="composition-head"><span class="lab">Manuscript format</span><span class="mono">${profile.label}</span></div>${c.profile === "script" ? `<p class="composition-copy">Screenplay is a measured page, not a decorative style.</p><div class="composition-lock"><b>Screenplay standard</b>Monospaced type · fixed reading width · preserved scene spacing. Switch to Prose to compose a reading document.</div>` : `<p class="composition-copy">Set the page once, then keep the prose moving.</p>${compositionButtons("measure", "Text width", c)}${compositionButtons("paragraphs", "First-line indent", c)}`}`;
  $$('[data-composition]', target).forEach((button) => button.addEventListener("click", () => {
    updateComposition({ [button.dataset.composition]: button.dataset.value });
  }));
}

function updateComposition(patch) {
  P.composition = { ...composition(), ...patch };
  db.updateProject(projectId, { composition: P.composition });
  P = db.project(projectId);
  applyComposition();
  renderComposition();
}

function rangeInDocument() {
  const selection = getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return doc.contains(range.commonAncestorContainer) ? range : null;
}

function rememberSelection() {
  const range = rangeInDocument();
  if (range) savedRange = range.cloneRange();
  return savedRange;
}

function restoreSelection() {
  if (!savedRange) return false;
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  return true;
}

function updateFormatToolbar() {
  const range = rangeInDocument();
  const inEditor = Boolean(range);
  $$("[data-inline]").forEach((button) => {
    const command = button.dataset.inline;
    button.setAttribute("aria-pressed", String(inEditor && document.queryCommandState(command)));
  });
}

function runInlineCommand(command) {
  if (!restoreSelection() && !rangeInDocument()) doc.focus();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, null);
  rememberSelection();
  markDirty();
  updateFormatToolbar();
}

function setTextScale(delta) {
  if (composition().profile === "script") return;
  const scales = ["compact", "standard", "large"];
  const current = Math.max(0, scales.indexOf(composition().scale));
  const next = scales[Math.max(0, Math.min(scales.length - 1, current + delta))];
  if (next !== composition().scale) updateComposition({ scale: next });
}

function selectionFragmentHtml(range) {
  const container = document.createElement("div");
  container.append(range.cloneContents());
  let html = sanitizeEditorHtml(container.innerHTML);
  if (!html) return "";
  if (!/<(?:p|div)\b/i.test(html)) html = `<p>${html}</p>`;
  return html;
}

function hideSelectionMenu() {
  selectionMenu.hidden = true;
}

function showSelectionMenu(event) {
  const range = rememberSelection();
  if (!range || range.collapsed || !range.toString().trim()) return;
  event?.preventDefault();
  const rect = range.getBoundingClientRect();
  selectionMenu.hidden = false;
  const left = Math.min(event?.clientX ?? rect.left, innerWidth - selectionMenu.offsetWidth - 8);
  const top = Math.min(event?.clientY ?? rect.bottom + 8, innerHeight - selectionMenu.offsetHeight - 8);
  selectionMenu.style.left = `${Math.max(8, left)}px`;
  selectionMenu.style.top = `${Math.max(8, top)}px`;
}

function createChapterFromSelection() {
  const range = savedRange;
  const text = range?.toString().replace(/\u00a0/g, " ").trim();
  if (!range || !text) return;
  const html = selectionFragmentHtml(range);
  commit();
  const chapter = db.createChapterFromText(projectId, { text, html });
  if (!chapter) return;
  P = db.project(projectId);
  renderChapters();
  restoreSelection();
  hideSelectionMenu();
  toast("New chapter created from the selected text.");
}

function renderChapters() {
  const list = $("#chaps");
  const n = P.chapters.length;
  const unit = P.kind === "script" ? "Scene" : "Ch.";
  const noun = P.kind === "script" ? "scene" : "chapter";
  list.innerHTML = P.chapters
    .map((c, i) => {
      const w = db.words(c.text);
      const cur = c.id === chapterId;
      return `
      <li class="chap-row${cur ? " on" : ""}">
        <button class="chap st-${esc(c.status)}" data-go="${esc(c.id)}" aria-current="${cur}">
          <span class="n">${unit} ${String(i + 1).padStart(2, "0")}</span>
          <span class="t">${esc(c.title)}</span>
          <span class="w">${db.fmt(w)} ${w === 1 ? "word" : "words"}</span>
        </button>
        <span class="chap-tools">
          <button class="icon-btn sm" data-up="${esc(c.id)}"
                  aria-label="Move up" title="Move up"${i === 0 ? " hidden" : ""}>
            <svg class="glyph" aria-hidden="true"><use href="#i-up"/></svg></button>
          <button class="icon-btn sm" data-down="${esc(c.id)}"
                  aria-label="Move down" title="Move down"${i === n - 1 ? " hidden" : ""}>
            <svg class="glyph" aria-hidden="true"><use href="#i-down"/></svg></button>
          <button class="icon-btn sm" data-delete="${esc(c.id)}"
                  aria-label="Delete ${noun}" title="Delete ${noun}"${n <= 1 ? " hidden" : ""}>
            <svg class="glyph" aria-hidden="true"><use href="#i-close"/></svg></button>
        </span>
      </li>`;
    })
    .join("");

  $$("[data-go]", list).forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.go))
  );

  const move = (b, key, delta) =>
    b.addEventListener("click", () => {
      db.moveChapter(projectId, b.dataset[key], delta);
      P = db.project(projectId);
      renderChapters();
    });
  $$("[data-up]", list).forEach((b) => move(b, "up", -1));
  $$("[data-down]", list).forEach((b) => move(b, "down", 1));
  $$("[data-delete]", list).forEach((b) => b.addEventListener("click", () => removeChapter(b.dataset.delete)));

  const w = db.projectWords(P);
  const pct = Math.min(100, Math.round((w / P.target) * 100));
  $("#nav-target").textContent = db.fmt(P.target);
  $("#nav-bar").style.width = pct + "%";
  $("#nav-words").textContent = db.fmt(w);
  $("#nav-pct").textContent = pct + "%";
}

function renderMeta() {
  document.title = `${C.title} — ${P.title} · Marzel`;
  $("#crumb-project").textContent = P.title;
  $("#crumb-chapter").textContent = C.title;
  $("#sheet-project").textContent = P.title;
  $("#sheet-kind").textContent =
    (db.KINDS[P.kind]?.label || P.kind) + " · " + (db.STATUSES[C.status] || C.status);
  const label = db.editedLabel(C.updated);
  $("#sheet-when").textContent = label.charAt(0).toUpperCase() + label.slice(1);
  $("#insp-syn").textContent = P.synopsis || "No premise recorded.";

  $$("#status .tab").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.status === C.status))
  );
  renderReference();
}

function renderReference() {
  const notesForProject = db.notes().filter((note) => note.projectId === projectId);
  const people = P.characters || [];
  const entries = [
    ...people.map((character) => ({ type: "Character", title: character.name, text: character.role || character.notes, href: `notebook.html?type=character&id=${encodeURIComponent(character.id)}&project=${encodeURIComponent(projectId)}` })),
    ...notesForProject.map((note) => ({ type: "Note", title: note.title || "Untitled note", text: note.body, href: `notebook.html?type=note&id=${encodeURIComponent(note.id)}` })),
  ];
  $("#editor-reference").innerHTML = entries.length
    ? entries.slice(0, 5).map((entry) => `<a class="editor-ref-item" href="${entry.href}"><span class="lab">${entry.type}</span><b>${esc(entry.title)}</b>${entry.text ? `<p>${esc(entry.text)}</p>` : ""}</a>`).join("")
    : `<p class="editor-ref-empty">No project reference yet.</p>`;
}

function notebookKey(item) {
  return `${item.type}:${item.projectId || ""}:${item.id}`;
}

function notebookProjectLabel(projectIdForRecord) {
  if (!projectIdForRecord) return "General";
  const project = db.project(projectIdForRecord);
  return project ? project.title : "Archived project";
}

function notebookFilteredRecords() {
  const query = notebookQuery.trim().toLowerCase();
  return loadNotebookRecords().filter((item) => {
    if (notebookFilter !== "all" && item.type !== notebookFilter) return false;
    if (!query) return true;
    return [item.title, item.body, item.role, notebookProjectLabel(item.projectId)]
      .join(" ").toLowerCase().includes(query);
  });
}

function notebookDetailHtml(item) {
  if (!item) {
    return `<div class="editor-notebook-empty"><span class="lab">Notebook</span><h3>Keep the surrounding work close.</h3><p>Notes, chapter notes and characters will appear here as you write.</p></div>`;
  }
  const projectLabel = notebookProjectLabel(item.projectId);
  const fullHref = item.type === "chapter-note"
    ? `editor.html?p=${encodeURIComponent(item.projectId)}&c=${encodeURIComponent(item.id)}`
    : `notebook.html?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}${item.projectId ? `&project=${encodeURIComponent(item.projectId)}` : ""}`;
  const body = item.type === "character" && item.role
    ? `<p class="editor-notebook-role">${esc(item.role)}</p><p class="editor-notebook-copy">${esc(item.body || "No notes yet.")}</p>`
    : `<p class="editor-notebook-copy">${esc(item.body || "No text yet.")}</p>`;
  return `<div class="editor-notebook-detail-head"><span class="lab">${notebookTypeLabel(item.type)} · ${esc(projectLabel)}</span><small>${db.editedLabel(item.updated)}</small><h3>${esc(item.title)}</h3></div><div class="editor-notebook-detail-body">${body}</div><div class="editor-notebook-detail-foot"><a class="btn ghost tiny" href="${fullHref}">${item.type === "chapter-note" ? "Open chapter" : "Edit record"}</a></div>`;
}

function renderNotebookDrawer() {
  const items = notebookFilteredRecords();
  const selected = items.find((item) => notebookKey(item) === notebookSelectedKey) || items[0] || null;
  notebookSelectedKey = selected ? notebookKey(selected) : "";
  $("#notebook-count").textContent = `${items.length} ${items.length === 1 ? "record" : "records"}`;
  $$('[data-notebook-filter]').forEach((button) => button.setAttribute("aria-selected", String(button.dataset.notebookFilter === notebookFilter)));
  notebookList.innerHTML = items.length
    ? items.map((item) => {
      const key = notebookKey(item);
      const preview = item.type === "character" ? item.role || item.body : item.body;
      const current = item.projectId === projectId;
      return `<button class="editor-notebook-row${key === notebookSelectedKey ? " is-selected" : ""}" type="button" data-notebook-item="${esc(key)}"><span class="editor-notebook-row-top"><span class="lab">${notebookTypeLabel(item.type)}${current ? " · Current" : ""}</span><small>${db.relTime(item.updated)}</small></span><b>${esc(item.title)}</b>${preview ? `<p>${esc(preview)}</p>` : ""}</button>`;
    }).join("")
    : `<div class="editor-notebook-empty tight"><span class="lab">Nothing here</span><h3>No matching context</h3><p>Try another search or filter, then keep writing.</p></div>`;
  notebookDetail.innerHTML = notebookDetailHtml(selected);
  notebookList.querySelectorAll("[data-notebook-item]").forEach((button) => button.addEventListener("click", () => {
    notebookSelectedKey = button.dataset.notebookItem;
    renderNotebookDrawer();
  }));
  $("#notebook-full-link").href = `notebook.html?project=${encodeURIComponent(projectId)}`;
}

function openNotebookNoteDialog() {
  const opener = document.activeElement;
  let draftType = "note";
  const layer = document.createElement("div");
  layer.className = "modal notebook-note-modal";
  layer.innerHTML = `<section class="modal-box wipe" role="dialog" aria-modal="true" aria-labelledby="notebook-note-heading" aria-describedby="notebook-note-copy"><div class="modal-head"><div><span class="lab solid">Notebook</span><h2 class="notebook-note-title" id="notebook-note-heading">New note</h2></div><button class="btn ghost tiny" type="button" data-note-close>Close</button></div><div class="modal-body" id="notebook-note-form"></div><div class="modal-foot"><button class="btn ghost" type="button" data-note-close>Cancel</button><button class="btn" type="button" data-note-save>Save</button></div></section>`;
  document.body.appendChild(layer);

  const renderForm = () => {
    const options = draftType === "character"
      ? db.projects().map((project) => ({ id: project.id, title: project.title }))
      : [{ id: "", title: "No project" }, ...db.projects().map((project) => ({ id: project.id, title: project.title }))];
    const projectOptions = options.map((option) => `<option value="${esc(option.id)}"${option.id === projectId ? " selected" : ""}>${esc(option.title)}</option>`).join("");
    const isNote = draftType === "note";
    $("#notebook-note-heading", layer).textContent = `New ${draftType}`;
    $("#notebook-note-form", layer).innerHTML = `<p class="notebook-note-copy" id="notebook-note-copy">${isNote ? "A note for the Notebook, not attached to the current chapter." : "A character for the Notebook, with notes separate from the current chapter."}</p><div class="tabs notebook-note-tabs" role="tablist"><button class="tab" type="button" role="tab" data-note-draft-type="note" aria-pressed="${isNote}">Note</button><button class="tab" type="button" role="tab" data-note-draft-type="character" aria-pressed="${!isNote}">Character</button></div><div class="field"><label class="lab" for="notebook-note-project">Project${isNote ? " — optional" : ""}</label><select class="inp" id="notebook-note-project"${!options.length ? " disabled" : ""}>${projectOptions}</select></div><div class="field"><label class="lab" for="notebook-note-title">${isNote ? "Title" : "Name"}</label><input class="inp" id="notebook-note-title" placeholder="${isNote ? "What you need to remember" : "Character name"}" autocomplete="off"></div>${isNote ? "" : `<div class="field"><label class="lab" for="notebook-note-role">Role — optional</label><input class="inp" id="notebook-note-role" placeholder="Their role, age or defining detail" autocomplete="off"></div>`}<div class="field"><label class="lab" for="notebook-note-body">${isNote ? "Note" : "Notes"}</label><textarea class="inp" id="notebook-note-body" rows="${isNote ? 8 : 7}" placeholder="${isNote ? "Write it for the version of you that will need it later." : "What they want, what they avoid, and the detail you keep forgetting."}"></textarea></div>`;
    $$('[data-note-draft-type]', layer).forEach((button) => button.addEventListener("click", () => {
      draftType = button.dataset.noteDraftType;
      renderForm();
      $("#notebook-note-title", layer).focus();
    }));
  };
  const close = () => {
    layer.removeEventListener("keydown", onKeydown);
    layer.remove();
    if (opener instanceof HTMLElement) opener.focus();
  };
  const save = () => {
    const title = $("#notebook-note-title", layer).value.trim();
    const body = $("#notebook-note-body", layer).value.trim();
    const noteProjectId = $("#notebook-note-project", layer).value || null;
    if (draftType === "note") {
      if (!title && !body) {
        toast("A note needs a title or text.");
        $("#notebook-note-title", layer).focus();
        return;
      }
      const note = db.createNote({ title: title || "Untitled note", body, projectId: noteProjectId });
      notebookSelectedKey = notebookKey({ type: "note", id: note.id, projectId: note.projectId || "" });
    } else {
      if (!title) {
        toast("A character needs a name.");
        $("#notebook-note-title", layer).focus();
        return;
      }
      if (!noteProjectId) {
        toast("A character needs a project.");
        $("#notebook-note-project", layer).focus();
        return;
      }
      const character = db.createCharacter(noteProjectId, {
        name: title,
        role: $("#notebook-note-role", layer).value.trim(),
        notes: body,
      });
      notebookSelectedKey = notebookKey({ type: "character", id: character.id, projectId: noteProjectId });
    }
    renderNotebookDrawer();
    toast("Added to Notebook.");
    close();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  };
  layer.querySelectorAll("[data-note-close]").forEach((button) => button.addEventListener("click", close));
  layer.querySelector("[data-note-save]").addEventListener("click", save);
  layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
  layer.addEventListener("keydown", onKeydown);
  renderForm();
  $("#notebook-note-title", layer).focus();
}

function setNotebookOpen(open) {
  const next = open === undefined ? !document.documentElement.classList.contains("notebook-open") : open;
  if (next) {
    document.documentElement.classList.remove("insp-open");
    document.documentElement.classList.add("insp-closed");
    $("#insp-toggle").setAttribute("aria-pressed", "false");
  }
  document.documentElement.classList.toggle("notebook-open", next);
  notebookDrawer.setAttribute("aria-hidden", String(!next));
  notebookToggle.setAttribute("aria-pressed", String(next));
  if (next) {
    renderNotebookDrawer();
    setTimeout(() => notebookQueryInput.focus(), 0);
  }
}

function renderStats() {
  const text = docText();
  const w = db.words(text);
  const savedWords = db.words(C.text);
  const paras = text.split(/\n{2,}/).filter((p) => p.trim()).length;

  $("#s-words").textContent = db.fmt(w);
  $("#s-chars").textContent = db.fmt(db.chars(text));
  $("#s-paras").textContent = db.fmt(paras);
  $("#s-read").textContent = db.readingTime(w, P.kind);

  const totalNow = db.projects().reduce((n, p) => n + db.projectWords(p), 0);
  const live = totalNow - savedWords + w;
  const session = Math.max(0, live - sessionBase);
  const projectWords = db.projectWords(P) - savedWords + w;
  const projectPct = Math.min(100, Math.round((projectWords / P.target) * 100));
  const liveToday = db.todayWords() + Math.max(0, w - savedWords);

  $("#nav-words").textContent = db.fmt(projectWords);
  $("#nav-bar").style.width = projectPct + "%";
  $("#nav-pct").textContent = projectPct + "%";
  const currentChapterWords = $("#chaps .chap-row.on .w");
  if (currentChapterWords) currentChapterWords.textContent = db.fmt(w) + (w === 1 ? " word" : " words");

  $("#s-session").textContent = db.fmt(session);
  $("#s-today").textContent = db.fmt(liveToday);

  const goal = db.prefs().dailyGoal || 750;
  const pct = Math.min(100, Math.round((liveToday / goal) * 100));
  $("#s-goal-bar").style.width = pct + "%";
  $("#s-goal-note").textContent =
    liveToday >= goal
      ? "Daily goal met (" + db.fmt(goal) + ")."
      : db.fmt(goal - liveToday) + " to go for today's goal.";

  $("#f-words").textContent = db.fmt(w) + (w === 1 ? " word" : " words");
  $("#f-session").textContent = "session " + db.fmt(session);
  $("#f-read").textContent = db.readingTime(w, P.kind) + " read";
}

function checkpointStamp(value) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderCheckpoints() {
  const panel = $("#checkpoints");
  const revisions = db.chapterRevisions(projectId, chapterId);
  panel.innerHTML = `<div class="insp-title-row"><span class="lab">Private checkpoints</span><button class="mono inspector-action" type="button" id="save-checkpoint">Save</button></div><p class="insp-note">A checkpoint keeps this chapter's text, notes and status here and in your backup.</p>${revisions.length ? `<div class="checkpoint-list">${revisions.slice(0, 3).map((revision) => `<div class="checkpoint-row"><span>${checkpointStamp(revision.savedAt)}</span><button class="mono" type="button" data-restore-checkpoint="${revision.id}">Restore</button></div>`).join("")}</div>` : ""}`;
  $("#save-checkpoint").addEventListener("click", () => {
    commit();
    db.checkpointChapter(projectId, chapterId);
    renderCheckpoints();
    toast("Private checkpoint saved.");
  });
  $$('[data-restore-checkpoint]', panel).forEach((button) => button.addEventListener("click", async () => {
    const accepted = await confirmAction({
      title: "Restore this checkpoint?",
      message: "The current text, notes and status of this chapter will be replaced. You can save a checkpoint first if you want to keep both.",
      confirmLabel: "Restore checkpoint",
      cancelLabel: "Keep current chapter",
    });
    if (!accepted || !db.restoreChapterRevision(projectId, chapterId, button.dataset.restoreCheckpoint)) return;
    C = db.chapter(projectId, chapterId);
    load();
    toast("Checkpoint restored.");
  }));
}

function load() {
  C = db.chapter(projectId, chapterId);
  doc.innerHTML = C.html ? sanitizeEditorHtml(C.html) : editableHtml(C.text);
  editorWords = db.words(docText());
  wrapStrayText();
  titleInput.value = C.title;
  notes.value = C.notes || "";
  applyComposition();
  renderChapters();
  renderMeta();
  renderStats();
  renderComposition();
  renderCheckpoints();
  updateFormatToolbar();
}

function go(id) {
  commit();
  chapterId = id;
  history.replaceState(null, "", `?p=${encodeURIComponent(projectId)}&c=${encodeURIComponent(id)}`);
  load();
  document.documentElement.classList.remove("nav-open");
  doc.scrollIntoView({ block: "start" });
  doc.focus({ preventScroll: true });
}

doc.addEventListener("input", () => { wrapStrayText();
  const nextWords = db.words(docText());
  writingTracker.recordChange({ beforeWords: editorWords, afterWords: nextWords });
  editorWords = nextWords;
  renderStats(); markDirty(); updateFormatToolbar();
});
doc.addEventListener("paste", (event) => {
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
});
doc.addEventListener("contextmenu", showSelectionMenu);
doc.addEventListener("mouseup", () => { rememberSelection(); updateFormatToolbar(); });
doc.addEventListener("keyup", () => { rememberSelection(); updateFormatToolbar(); });
titleInput.addEventListener("input", markDirty);
notes.addEventListener("input", markDirty);

function openProjectExportDialog() {
  commit();
  P = db.project(projectId);
  const opener = document.activeElement;
  const layer = document.createElement("div");
  layer.className = "modal export-modal";
  layer.innerHTML = `<section class="modal-box wipe" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" aria-describedby="export-dialog-copy"><div class="modal-head"><span class="lab solid">Export manuscript</span><button class="btn ghost tiny" type="button" data-export-close>Close</button></div><div class="modal-body"><h2 class="export-title" id="export-dialog-title"></h2><p class="export-copy" id="export-dialog-copy">Every chapter is included in order. Choose a clean file that carries the typeface, text size, spacing, first-line indent and bold or italic text you used here.</p><div class="export-options"><button class="export-option" type="button" data-export-format="docx"><span class="export-option-title">Word document <b>.docx</b></span><span>Editable in Word, Pages and Google Docs. Best for continuing the manuscript elsewhere.</span></button><button class="export-option" type="button" data-export-format="html"><span class="export-option-title">Styled document <b>.html</b></span><span>The closest visual match to Marzel. Opens in any browser and remains editable.</span></button><button class="export-option" type="button" data-export-format="pdf"><span class="export-option-title">Print or save as PDF</span><span>Opens a print-ready version. Choose “Save as PDF” in the system dialog for a fixed copy.</span></button></div></div><div class="modal-foot"><button class="btn ghost" type="button" data-export-close>Cancel</button></div></section>`;
  layer.querySelector(".export-title").textContent = P.title || "Untitled manuscript";
  document.body.appendChild(layer);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    layer.remove();
    if (opener instanceof HTMLElement) opener.focus();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...layer.querySelectorAll("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  layer.querySelectorAll("[data-export-close]").forEach((button) => button.addEventListener("click", close));
  layer.addEventListener("mousedown", (event) => { if (event.target === layer) close(); });
  layer.querySelectorAll("[data-export-format]").forEach((button) => button.addEventListener("click", () => {
    const format = button.dataset.exportFormat;
    if (format === "docx") {
      downloadProjectDocx(P);
      trackExport("docx", P);
      toast("Word manuscript downloaded.");
    } else if (format === "html") {
      downloadProjectHtml(P);
      trackExport("html", P);
      toast("Styled manuscript downloaded.");
    } else if (printProject(P)) {
      toast("Print dialog opened. Choose Save as PDF for a fixed copy.");
    } else {
      toast("Allow the print window to create a PDF.");
      return;
    }
    close();
  }));
  document.addEventListener("keydown", onKeydown);
  layer.querySelector("[data-export-format]").focus();
}

$("#export-project").addEventListener("click", openProjectExportDialog);

document.addEventListener("selectionchange", () => {
  if (rangeInDocument()) { rememberSelection(); updateFormatToolbar(); }
});
document.addEventListener("pointerdown", (event) => {
  if (!selectionMenu.contains(event.target)) hideSelectionMenu();
});
selectionMenu.addEventListener("mousedown", (event) => event.preventDefault());
selectionAction.addEventListener("click", createChapterFromSelection);
selectionInlineActions.forEach((button) => button.addEventListener("click", () => {
  runInlineCommand(button.dataset.selectionInline);
  hideSelectionMenu();
}));
$$("[data-format-font]").forEach((button) => button.addEventListener("click", () => {
  if (composition().profile !== "script") updateComposition({ font: button.dataset.formatFont });
}));
$$("[data-scale-delta]").forEach((button) => button.addEventListener("click", () => setTextScale(Number(button.dataset.scaleDelta))));
$$("[data-inline]").forEach((button) => button.addEventListener("mousedown", () => rememberSelection()));
$$("[data-inline]").forEach((button) => button.addEventListener("click", () => runInlineCommand(button.dataset.inline)));

$$("#status .tab").forEach((b) =>
  b.addEventListener("click", () => {
    db.writeChapter(projectId, chapterId, { status: b.dataset.status });
    C = db.chapter(projectId, chapterId);
    renderChapters();
    renderMeta();
    toast("Chapter marked as " + (db.STATUSES[b.dataset.status] || "").toLowerCase() + ".");
  })
);

$("#add-chapter").addEventListener("click", () => {
  commit();
  const c = db.createChapter(projectId);
  P = db.project(projectId);
  go(c.id);
  titleInput.select();
});

async function removeChapter(id = chapterId) {
  commit();
  if (P.chapters.length <= 1) {
    toast("A manuscript needs at least one chapter.");
    return;
  }
  const chapter = P.chapters.find((item) => item.id === id);
  if (!chapter) return;
  const unit = P.kind === "script" ? "scene" : "chapter";
  if (!await confirmAction({
    title: `Delete ${unit}?`,
    message: `“${chapter.title}” will be permanently removed from this manuscript.`,
    confirmLabel: `Delete ${unit}`,
  })) return;
  const i = P.chapters.findIndex((item) => item.id === id);
  if (!db.deleteChapter(projectId, id)) return;
  P = db.project(projectId);
  if (id === chapterId) {
    dirty = false;
    go(P.chapters[Math.max(0, i - 1)].id);
  } else {
    renderChapters();
    renderMeta();
  }
  toast(`${unit[0].toUpperCase()}${unit.slice(1)} deleted.`);
}

function setFace(face) {
  const preset = db.MANUSCRIPT_PROFILES[face];
  if (!preset) return;
  updateComposition({ ...preset, profile: face });
}

$$("#face .tab").forEach((b) => b.addEventListener("click", () => setFace(b.dataset.face)));

function toggleFocus(on) {
  const root = document.documentElement;
  const next = on === undefined ? !root.classList.contains("focus") : on;
  root.classList.toggle("focus", next);
  $("#focus-toggle").setAttribute("aria-pressed", String(next));
  $("#focus-toggle").querySelector("use").setAttribute("href", next ? "#i-shrink" : "#i-focus");
  grow();
  if (next) doc.focus({ preventScroll: true });
}

function inspectorIsOpen() {
  const root = document.documentElement;
  if (root.classList.contains("insp-closed")) return false;
  if (root.classList.contains("insp-open")) return true;
  return matchMedia("(min-width: 1021px)").matches;
}

function setInspectorOpen(open) {
  const root = document.documentElement;
  if (open) setNotebookOpen(false);
  root.classList.toggle("insp-open", open);
  root.classList.toggle("insp-closed", !open);
  $("#insp-toggle").setAttribute("aria-pressed", String(open));
}

function toggleInsp() {
  setInspectorOpen(!inspectorIsOpen());
}

notebookToggle.addEventListener("click", () => setNotebookOpen());
notebookClose.addEventListener("click", () => setNotebookOpen(false));
notebookBackdrop.addEventListener("click", () => setNotebookOpen(false));
$("#open-notebook").addEventListener("click", () => setNotebookOpen(true));
notebookQueryInput.addEventListener("input", () => {
  notebookQuery = notebookQueryInput.value;
  renderNotebookDrawer();
});
$$('[data-notebook-filter]').forEach((button) => button.addEventListener("click", () => {
  notebookFilter = button.dataset.notebookFilter;
  renderNotebookDrawer();
}));
document.addEventListener("marzel:data-changed", () => {
  if (document.documentElement.classList.contains("notebook-open")) renderNotebookDrawer();
});

$("#focus-toggle").addEventListener("click", () => toggleFocus());
$("#insp-toggle").addEventListener("click", toggleInsp);
$("#insp-toggle").setAttribute("aria-pressed", String(inspectorIsOpen()));
$("#notebook-add-note").addEventListener("click", openNotebookNoteDialog);
$("#nav-toggle").addEventListener("click", () =>
  document.documentElement.classList.toggle("nav-open")
);

addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    commit();
    toast("Saved.");
    return;
  }
  if (e.key === "Escape") {
    if (document.documentElement.classList.contains("notebook-open")) setNotebookOpen(false);
    else if (!selectionMenu.hidden) hideSelectionMenu();
    else if (document.documentElement.classList.contains("focus")) toggleFocus(false);
    else if (inspectorIsOpen()) setInspectorOpen(false);
    return;
  }
  if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && doc.contains(e.target)) {
    showSelectionMenu(e);
    return;
  }
  if (typing) return;

  const k = e.key.toLowerCase();
  if (k === "f") { e.preventDefault(); toggleFocus(); }
  if (k === "i") { e.preventDefault(); toggleInsp(); }
});

mountTheme();
mountFileImport();
load();
setInterval(() => writingTracker.tick(), 5000);

setInterval(() => { renderMeta(); }, 60000);
