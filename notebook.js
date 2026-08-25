import * as db from "./store.js";
import { mount, toast } from "./shell.js";
import { renderShell, setHead, page, acts, esc } from "./chrome.js";
import { notebookRecords, notebookTypeLabel } from "./notebook-data.js";

renderShell("notebook.html");
setHead("Notebook");
acts().innerHTML = `<button class="btn" id="new-record"><svg class="glyph" aria-hidden="true"><use href="#i-plus"/></svg>New</button>`;

const params = new URLSearchParams(location.search);
let filter = ["note", "chapter-note", "character"].includes(params.get("filter")) ? params.get("filter") : "all";
let projectFilter = params.get("project") || "all";
const newNote = params.get("new") === "note";
let selected = params.get("id")
  ? { type: params.get("type"), id: params.get("id"), projectId: params.get("project") || "" }
  : newNote ? { new: true, type: "note", projectId: params.get("project") || "" } : null;
let draftType = selected?.type || "note";
let focusDetail = Boolean(params.get("id") || newNote);

function records() {
  return notebookRecords();
}

function current(items) {
  if (!selected || selected.new) return null;
  return items.find((item) => item.type === selected.type && item.id === selected.id && (!["character", "chapter-note"].includes(item.type) || item.projectId === selected.projectId)) || null;
}

function labelProject(id) { return id ? db.project(id)?.title || "Archived project" : "No project"; }
function makeNew(type) { selected = { new: true, type }; draftType = type; focusDetail = true; draw(); }

function picker(id, value, options, label, disabled = false) {
  const selectedOption = options.find((option) => option.value === value) || options[0];
  const listId = `${id}-options`;
  return `<div class="select-menu${disabled ? " is-disabled" : ""}" data-select-menu data-picker="${id}"><input type="hidden" id="${id}" value="${esc(selectedOption.value)}"><button class="select-trigger" type="button" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}"${disabled ? " disabled" : ""}><span>${esc(selectedOption.label)}</span><i class="select-indicator" aria-hidden="true"></i></button><div class="select-options" id="${listId}" role="listbox" aria-label="${esc(label)}">${options.map((option) => `<button type="button" class="select-option" role="option" data-select-value="${esc(option.value)}" aria-selected="${option.value === selectedOption.value}">${esc(option.label)}</button>`).join("")}</div></div>`;
}

function mountPickers() {
  document.querySelectorAll("[data-select-menu]").forEach((menu) => {
    const trigger = menu.querySelector(".select-trigger");
    const value = menu.querySelector("input");
    const options = [...menu.querySelectorAll(".select-option")];
    if (trigger.disabled) return;

    const close = (focus = false) => {
      menu.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (focus) trigger.focus();
    };
    const open = (focusIndex) => {
      document.querySelectorAll("[data-select-menu].is-open").forEach((other) => {
        if (other !== menu) {
          other.classList.remove("is-open");
          other.querySelector(".select-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      if (Number.isInteger(focusIndex)) requestAnimationFrame(() => options[focusIndex]?.focus());
    };
    const choose = (nextValue) => {
      const option = options.find((item) => item.dataset.selectValue === nextValue);
      if (!option) return;
      value.value = nextValue;
      trigger.querySelector("span").textContent = option.textContent;
      options.forEach((item) => item.setAttribute("aria-selected", String(item === option)));
      close();
      if (menu.dataset.picker === "project-filter") {
        projectFilter = nextValue;
        draw();
      }
    };
    const selectedIndex = () => Math.max(0, options.findIndex((item) => item.dataset.selectValue === value.value));

    trigger.addEventListener("click", () => menu.classList.contains("is-open") ? close() : open());
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { close(); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const currentIndex = selectedIndex();
        const nextIndex = event.key === "ArrowDown" ? Math.min(currentIndex + 1, options.length - 1) : event.key === "ArrowUp" ? Math.max(currentIndex - 1, 0) : event.key === "Home" ? 0 : options.length - 1;
        open(nextIndex);
      }
    });
    options.forEach((option, index) => {
      option.addEventListener("click", () => choose(option.dataset.selectValue));
      option.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); close(true); return; }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(option.dataset.selectValue); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1) : event.key === "ArrowUp" ? Math.max(index - 1, 0) : event.key === "Home" ? 0 : options.length - 1;
          options[nextIndex]?.focus();
        }
      });
    });
  });
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-select-menu]")) return;
  document.querySelectorAll("[data-select-menu].is-open").forEach((menu) => {
    menu.classList.remove("is-open");
    menu.querySelector(".select-trigger")?.setAttribute("aria-expanded", "false");
  });
});

function draw() {
  const all = records();
  const filtered = all.filter((item) => (filter === "all" || item.type === filter) && (projectFilter === "all" || item.projectId === projectFilter));
  if (!selected && filtered[0]) selected = { type: filtered[0].type, id: filtered[0].id, projectId: filtered[0].projectId };
  const selectedItem = current(all);
  setHead("Notebook", `${all.length} records`);
  page().innerHTML = `
    <p class="page-intro">The material around the manuscript: people, research, decisions and details you do not want to rediscover while writing.</p>
    <div class="notebook-controls"><div class="tabs" role="tablist"><button class="tab" data-filter="all" role="tab" aria-selected="${filter === "all"}">All</button><button class="tab" data-filter="note" role="tab" aria-selected="${filter === "note"}">Notes</button><button class="tab" data-filter="chapter-note" role="tab" aria-selected="${filter === "chapter-note"}">Chapter notes</button><button class="tab" data-filter="character" role="tab" aria-selected="${filter === "character"}">Characters</button></div>${picker("project-filter", projectFilter, [{ value: "all", label: "All projects" }, { value: "", label: "No project" }, ...db.projects().map((project) => ({ value: project.id, label: project.title }))], "Filter records by project")}</div>
    <div class="notebook-layout"><section class="notebook-list" id="notebook-list">${filtered.length ? filtered.map((item) => row(item, selectedItem)).join("") : `<div class="empty tight"><span class="lab">Nothing here</span><h4>No matching records</h4><p>Try another filter or make a note for the current work.</p></div>`}</section><section class="detail-card" id="detail">${detail(selectedItem)}</section></div>`;

  mountPickers();
  document.querySelectorAll("[data-filter]").forEach((button) => button.onclick = () => { filter = button.dataset.filter; draw(); });
  document.querySelectorAll("[data-select]").forEach((button) => button.onclick = () => { selected = JSON.parse(button.dataset.select); focusDetail = true; draw(); });
  document.getElementById("new-record").onclick = () => makeNew("note");
  mountDetail(selectedItem);
  if (focusDetail && innerWidth <= 900) {
    focusDetail = false;
    setTimeout(() => document.getElementById("detail")?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  }
}

function row(item, active) {
  const project = labelProject(item.projectId);
  const preview = item.type === "character" ? item.role || item.body : item.body;
  const currentItem = active && item.type === active.type && item.id === active.id && item.projectId === active.projectId;
  const type = notebookTypeLabel(item.type);
  return `<button class="notebook-row" data-select='${JSON.stringify({ type: item.type, id: item.id, projectId: item.projectId })}' aria-current="${currentItem}"><div class="notebook-row-top"><span class="lab">${type} · ${esc(project)}</span><small>${db.relTime(item.updated)}</small></div><h2>${esc(item.title)}</h2>${preview ? `<p>${esc(preview)}</p>` : ""}</button>`;
}

function projectOptions(required = false) {
  return [
    ...(required ? [] : [{ value: "", label: "No project" }]),
    ...db.projects().map((project) => ({ value: project.id, label: project.title })),
  ];
}

function detail(item) {
  const type = item?.type || draftType;
  const isNew = !item;
  const draftProjectId = selected?.new ? selected.projectId || "" : "";
  if (item?.type === "chapter-note") {
    const href = `editor.html?p=${encodeURIComponent(item.projectId)}&c=${encodeURIComponent(item.id)}`;
    return `<div class="detail-head"><h2>Chapter note</h2><span class="lab">Source: chapter inspector</span></div><div class="detail-body"><div class="field"><span class="lab">Chapter</span><p class="detail-readonly-title">${esc(item.title)}</p></div><div class="field"><span class="lab">Note</span><p class="detail-readonly">${esc(item.body)}</p></div><div class="detail-actions"><span></span><a class="btn" href="${href}">Open chapter</a></div></div>`;
  }
  if (type === "character" && !db.projects().length) return `<div class="detail-head"><h2>New character</h2></div><div class="detail-body"><div class="empty tight"><span class="lab">A project is needed</span><h4>Characters live with a manuscript</h4><p>Create a project first, or capture this as a general note.</p><button class="btn" id="switch-note">Make a note instead</button></div></div>`;
  const title = type === "note" ? item?.title || "" : item?.title || "";
  const body = item?.body || "";
  const role = item?.role || "";
  return `<div class="detail-head"><h2>${isNew ? `New ${type}` : `Editing ${type}`}</h2>${isNew ? `<div class="tabs"><button class="tab" data-draft-type="note" aria-pressed="${type === "note"}">Note</button><button class="tab" data-draft-type="character" aria-pressed="${type === "character"}">Character</button></div>` : `<span class="lab">${type}</span>`}</div><div class="detail-body"><div class="field"><span class="lab">Project${type === "note" ? " — optional" : ""}</span>${picker("detail-project", item?.projectId || draftProjectId, projectOptions(type === "character"), "Project", item?.type === "character")}</div><div class="field"><span class="lab">${type === "note" ? "Title" : "Name"}</span><input class="inp" id="detail-title" value="${esc(title)}" placeholder="${type === "note" ? "What you need to remember" : "Character name"}" autocomplete="off"></div>${type === "character" ? `<div class="field"><span class="lab">Role — optional</span><input class="inp" id="detail-role" value="${esc(role)}" placeholder="Their role, age or defining detail" autocomplete="off"></div>` : ""}<div class="field"><span class="lab">${type === "note" ? "Note" : "Notes"}</span><textarea class="inp" id="detail-body" rows="${type === "note" ? 9 : 7}" placeholder="${type === "note" ? "Write it for the version of you that will need it later." : "What they want, what they avoid, and the detail you keep forgetting."}">${esc(body)}</textarea></div><div class="detail-actions">${isNew ? `<span></span>` : `<button class="btn ghost tiny" id="detail-delete">Delete</button>`}<div class="right">${!isNew ? `<button class="btn ghost" id="detail-cancel">Cancel</button>` : ""}<button class="btn" id="detail-save">${isNew ? "Save" : "Save changes"}</button></div></div></div>`;
}

function mountDetail(item) {
  document.querySelectorAll("[data-draft-type]").forEach((button) => button.onclick = () => { draftType = button.dataset.draftType; if (!item) selected = { new: true, type: draftType }; draw(); });
  document.getElementById("switch-note")?.addEventListener("click", () => makeNew("note"));
  document.getElementById("detail-cancel")?.addEventListener("click", () => { selected = null; draw(); });
  document.getElementById("detail-delete")?.addEventListener("click", () => remove(item));
  document.getElementById("detail-save")?.addEventListener("click", () => save(item));
  if (!item) setTimeout(() => document.getElementById("detail-title")?.focus(), 0);
}

function save(item) {
  const type = item?.type || draftType;
  const title = document.getElementById("detail-title").value.trim();
  const body = document.getElementById("detail-body").value.trim();
  const projectId = document.getElementById("detail-project").value || null;
  if (type === "note") {
    if (!title && !body) { document.getElementById("detail-title").focus(); toast("A note needs a title or text."); return; }
    if (item) db.updateNote(item.id, { title: title || "Untitled note", body, projectId });
    else { const note = db.createNote({ title: title || "Untitled note", body, projectId }); selected = { type: "note", id: note.id, projectId: note.projectId || "" }; }
  } else {
    if (!title) { document.getElementById("detail-title").focus(); toast("A character needs a name."); return; }
    const role = document.getElementById("detail-role").value.trim();
    if (item) db.updateCharacter(item.projectId, item.id, { name: title, role, notes: body });
    else { const character = db.createCharacter(projectId, { name: title, role, notes: body }); selected = { type: "character", id: character.id, projectId }; }
  }
  toast(item ? "Saved." : "Added to Notebook.");
  draw();
}

function remove(item) {
  if (!item) return;
  if (!confirm(`Delete “${item.title}”?\n\nThis cannot be undone.`)) return;
  item.type === "note" ? db.deleteNote(item.id) : db.deleteCharacter(item.projectId, item.id);
  selected = null; toast("Record deleted."); draw();
}

mount();
draw();
