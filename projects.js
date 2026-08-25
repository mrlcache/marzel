import * as db from "./store.js";
import { downloadProjectArchive, downloadProjectMarkdown } from "./exporter.js";
import { confirmAction, mount, toast } from "./shell.js";
import { renderShell, setHead, page, acts, esc } from "./chrome.js";
import { trackExport, trackProjectCreated } from "./analytics.js";

renderShell("projects.html");
let view = new URLSearchParams(location.search).get("view") === "archived" ? "archived" : "active";
let kind = "book";
let managing = null;
const LENGTH_REFERENCES = [
  { title: "The Stranger", words: 36000, pages: "~120 pages" },
  { title: "1984", words: 89000, pages: "~330 pages" },
  { title: "War and Peace", words: 587000, pages: "~1,200 pages" },
];

acts().innerHTML = `<button class="btn ghost" id="import-project">Import</button><button class="btn" id="new-project"><svg class="glyph" aria-hidden="true"><use href="#i-plus"/></svg>New project</button>`;

function href(p) {
  const c = p.chapters.reduce((latest, item) => item.updated > latest.updated ? item : latest, p.chapters[0]);
  return `editor.html?p=${encodeURIComponent(p.id)}&c=${encodeURIComponent(c.id)}`;
}

function draw() {
  const list = view === "archived" ? db.archivedProjects() : db.projects();
  setHead("Projects", `${db.projects().length} active`);
  page().innerHTML = `
    <div class="project-tabs"><div class="tabs" role="tablist"><button class="tab" data-view="active" role="tab" aria-selected="${view === "active"}">Active</button><button class="tab" data-view="archived" role="tab" aria-selected="${view === "archived"}">Archive ${db.archivedProjects().length ? `(${db.archivedProjects().length})` : ""}</button></div><span class="mono">${view === "active" ? "Work in progress" : "Put away, not deleted"}</span></div>
    <div class="project-list" id="project-list">${list.length ? list.map(card).join("") : empty()}</div>
    ${modal()}${manageModal()}`;

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view;
    const url = new URL(location.href);
    view === "archived" ? url.searchParams.set("view", "archived") : url.searchParams.delete("view");
    history.replaceState(null, "", url);
    draw();
  }));
  document.querySelectorAll("[data-archive]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.archive); if (!project) return;
    db.archiveProject(project.id); toast(`“${project.title}” moved to Archive.`); draw();
  }));
  document.querySelectorAll("[data-restore]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.restore); if (!project) return;
    db.restoreProject(project.id); toast(`“${project.title}” restored to Projects.`); draw();
  }));
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => {
    deleteProject(button.dataset.delete);
  }));
  document.querySelectorAll("[data-manage]").forEach((button) => button.addEventListener("click", () => {
    managing = button.dataset.manage;
    draw();
  }));
  document.querySelectorAll("[data-manage-rename]").forEach((button) => button.addEventListener("click", () => {
    const summary = button.closest(".manage-summary");
    const project = db.project(button.dataset.manageRename);
    if (!summary || !project) return;
    summary.innerHTML = `<span class="lab">${esc(db.KINDS[project.kind]?.label || project.kind)} project</span><div class="manage-name-edit"><input class="inp" id="manage-project-title" value="${esc(project.title)}" autocomplete="off" aria-label="Project name"><button class="btn" type="button" data-manage-save-name="${esc(project.id)}">Save</button><button class="btn ghost" type="button" data-manage-cancel-name>Cancel</button></div>`;
    const input = summary.querySelector("#manage-project-title");
    const save = () => {
      const title = input.value.trim();
      if (!title) { input.focus(); toast("Give the project a name."); return; }
      db.updateProject(project.id, { title });
      toast("Project name updated.");
      draw();
    };
    summary.querySelector("[data-manage-save-name]").onclick = save;
    summary.querySelector("[data-manage-cancel-name]").onclick = () => draw();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") save();
      if (event.key === "Escape") draw();
    });
    input.focus();
    input.select();
  }));
  document.querySelectorAll("[data-manage-close]").forEach((button) => button.addEventListener("click", () => {
    managing = null;
    draw();
  }));
  document.querySelectorAll("[data-manage-archive]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.manageArchive); if (!project) return;
    db.archiveProject(project.id); managing = null; toast("Project moved to Archive."); draw();
  }));
  document.querySelectorAll("[data-manage-restore]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.manageRestore); if (!project) return;
    db.restoreProject(project.id); managing = null; toast("Project restored to active work."); draw();
  }));
  document.querySelectorAll("[data-manage-delete]").forEach((button) => button.addEventListener("click", () => {
    deleteProject(button.dataset.manageDelete, true);
  }));
  document.querySelectorAll("[data-export-project]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.exportProject);
    if (!project) return;
    downloadProjectMarkdown(project);
    trackExport("md", project);
    toast("Markdown export downloaded.");
  }));
  document.querySelectorAll("[data-export-archive]").forEach((button) => button.addEventListener("click", () => {
    const project = db.project(button.dataset.exportArchive);
    if (!project) return;
    downloadProjectArchive(project);
    trackExport("archive", project);
    toast("ZIP manuscript package downloaded.");
  }));
  mountModal();
}

function card(p) {
  const words = db.projectWords(p);
  const percent = Math.min(100, Math.round((words / p.target) * 100));
  const unit = p.kind === "script" ? "scene" : "chapter";
  return `<article class="project-card"><div>
    <span class="lab">${esc(db.KINDS[p.kind]?.label || p.kind)} · ${db.relTime(p.updated)}</span>
    <h2>${esc(p.title)}</h2>${p.synopsis ? `<p>${esc(p.synopsis)}</p>` : ""}
    <div class="quota"><i style="width:${percent}%"></i></div>
    <div class="project-meta"><span><strong class="num">${db.fmt(words)}</strong> / ${db.fmt(p.target)} words</span><span>${percent}%</span><span>${p.chapters.length} ${p.chapters.length === 1 ? unit : unit + "s"}</span></div>
    ${p.archived ? "" : `<a class="project-open" href="${href(p)}">Open manuscript <svg class="glyph" aria-hidden="true"><use href="#i-chev"/></svg></a>`}
  </div><div class="project-actions"><button class="btn ghost tiny" data-manage="${esc(p.id)}">Manage</button><button class="btn ghost tiny" data-delete="${esc(p.id)}">Delete</button></div></article>`;
}

async function deleteProject(id, closeManage = false) {
  const project = db.project(id);
  if (!project) return;
  const accepted = await confirmAction({
    title: "Delete project?",
    message: `“${project.title}” and all of its chapters, notes and characters will be permanently removed.`,
    confirmLabel: "Delete project",
  });
  if (!accepted) return;
  db.deleteProject(project.id);
  if (closeManage) managing = null;
  toast("Project deleted.");
  draw();
}

function empty() {
  if (view === "archived") return `<div class="empty tight"><span class="lab">Archive empty</span><h4>Nothing put away yet</h4><p>Archive is for projects you want to keep without seeing them in the work in progress.</p></div>`;
  return `<div class="empty tight"><span class="lab">No active projects</span><h4>Start with one manuscript</h4><p>A project is simply the home for its chapters and reference material.</p><button class="btn" data-open-modal>Create project</button></div>`;
}

function modal() {
  const references = LENGTH_REFERENCES.map((reference) => `<button class="length-reference" type="button" data-reference-words="${reference.words}" aria-pressed="false"><b>${reference.title}</b><span>${db.fmt(reference.words)} words · ${reference.pages}</span></button>`).join("");
  return `<div class="modal" id="project-modal" hidden><div class="modal-box wipe" role="dialog" aria-modal="true" aria-labelledby="project-modal-title"><div class="modal-head"><span class="lab solid" id="project-modal-title">New project</span><button class="btn ghost tiny" data-close-modal>Close</button></div><div class="modal-body"><div class="field"><span class="lab">Project name <span style="opacity:.6">— optional</span></span><input class="inp" id="project-title" placeholder="Enter a project name" autocomplete="off"></div><div class="field"><span class="lab">Format</span><div class="tabs fill" id="project-kind" role="tablist"><button class="tab" role="tab" data-kind="book" aria-selected="true">Book</button><button class="tab" role="tab" data-kind="script" aria-selected="false">Screenplay</button><button class="tab" role="tab" data-kind="story" aria-selected="false">Story</button><button class="tab" role="tab" data-kind="essay" aria-selected="false">Essay</button></div></div><div class="field"><span class="lab">Word target</span><input class="inp num" id="project-target" type="number" min="500" step="500" value="80000"></div><div class="field length-references" id="book-length-references"><span class="lab">Reference lengths</span><div class="length-reference-list" role="group" aria-label="Book length references">${references}</div></div><div class="field"><span class="lab">Premise <span style="opacity:.6">— optional</span></span><textarea class="inp" id="project-synopsis" rows="3" placeholder="The reason you want to write it."></textarea></div></div><div class="modal-foot"><button class="btn ghost" data-close-modal>Cancel</button><button class="btn" id="create-project">Create and write</button></div></div></div>`;
}

function manageModal() {
  const project = managing ? db.project(managing) : null;
  if (!project) return "";
  const kindLabel = db.KINDS[project.kind]?.label || project.kind;
  const archiveAction = project.archived
    ? `<button class="btn ghost" data-manage-restore="${esc(project.id)}">Restore project</button>`
    : `<button class="btn ghost" data-manage-archive="${esc(project.id)}">Archive project</button>`;
  const archiveCopy = project.archived
    ? "Bring this manuscript back into the active work."
    : "Keep the manuscript and its references without leaving it in the active work.";
  return `<div class="modal" id="manage-modal"><div class="modal-box wipe" role="dialog" aria-modal="true" aria-labelledby="manage-modal-title"><div class="modal-head"><span class="lab solid" id="manage-modal-title">Manage project</span><button class="btn ghost tiny" data-manage-close>Close</button></div><div class="modal-body manage-body"><div class="manage-summary"><button class="manage-name-trigger" type="button" data-manage-rename="${esc(project.id)}" aria-label="Rename ${esc(project.title)}"><span class="lab">${esc(kindLabel)} project</span><h2>${esc(project.title)}</h2></button></div><div class="field"><span class="lab">Export manuscript</span><p class="craft">Markdown is one raw, readable manuscript. ZIP includes that manuscript plus one Markdown file per chapter. A full, restorable library backup lives in Account.</p><div class="manage-export-actions"><button class="btn ghost" type="button" data-export-project="${esc(project.id)}">Download Markdown</button><button class="btn ghost" type="button" data-export-archive="${esc(project.id)}">Download ZIP package</button></div></div><div class="field"><span class="lab">Archive</span><p class="craft">${archiveCopy}</p>${archiveAction}</div><div class="manage-danger"><span class="lab">Delete project</span><p>Removes the manuscript, chapters and linked characters. This cannot be undone.</p><button class="btn ghost tiny" data-manage-delete="${esc(project.id)}">Delete project</button></div></div><div class="modal-foot"><button class="btn ghost" data-manage-close>Done</button></div></div></div>`;
}

function mountModal() {
  const modalEl = document.getElementById("project-modal");
  const target = document.getElementById("project-target");
  const referenceField = document.getElementById("book-length-references");
  const syncLengthReferences = () => {
    referenceField.hidden = kind !== "book";
    document.querySelectorAll("[data-reference-words]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.referenceWords) === Number(target.value)));
    });
  };
  const open = () => { modalEl.hidden = false; document.getElementById("project-title").focus(); };
  const close = () => { modalEl.hidden = true; };
  document.getElementById("new-project").onclick = open;
  document.getElementById("import-project").onclick = () => document.dispatchEvent(new CustomEvent("marzel:open-import"));
  document.querySelectorAll("[data-open-modal]").forEach((button) => button.onclick = open);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = close);
  document.querySelectorAll("[data-kind]").forEach((button) => button.onclick = () => {
    kind = button.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    target.value = db.KINDS[kind].target;
    syncLengthReferences();
  });
  document.querySelectorAll("[data-reference-words]").forEach((button) => button.onclick = () => {
    target.value = button.dataset.referenceWords;
    target.focus();
    syncLengthReferences();
  });
  target.addEventListener("input", syncLengthReferences);
  syncLengthReferences();
  document.getElementById("create-project").onclick = () => {
    const title = document.getElementById("project-title").value.trim();
    const project = db.createProject({ title, kind, target: document.getElementById("project-target").value, synopsis: document.getElementById("project-synopsis").value });
    trackProjectCreated(project, "new");
    location.href = `editor.html?p=${encodeURIComponent(project.id)}&c=${encodeURIComponent(project.chapters[0].id)}`;
  };
}

mount();
draw();
if (new URLSearchParams(location.search).get("new") === "1") setTimeout(() => document.getElementById("new-project").click(), 0);
