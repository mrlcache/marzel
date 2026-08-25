import { sanitizeHtml } from "./sanitize.js";

const KEY = "marzel-writer-v1";

export const KINDS = {
  book:   { label: "Book",       target: 80000 },
  script: { label: "Screenplay", target: 20000 },
  story:  { label: "Story",      target: 7500  },
  essay:  { label: "Essay",      target: 4000  },
};

export const STATUSES = {
  draft:   "Draft",
  revised: "Revised",
  final:   "Final",
};

export const MANUSCRIPT_PROFILES = {
  prose: {
    label: "Prose", font: "serif", scale: "standard", measure: "standard",
    paragraphs: "regular",
  },
  script: {
    label: "Screenplay", font: "mono", scale: "standard", measure: "standard",
    paragraphs: "compact",
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const analyticsUid = () => {
  try { return `ap-${crypto.randomUUID()}`; }
  catch { return `ap-${uid()}${Date.now().toString(36)}`; }
};
const now = () => Date.now();
const ENGLISH_WORD = /[\p{L}\p{N}]+(?:(?:[.'\u2019-])[\p{L}\p{N}]+)*/gu;
const untitledProjectTitle = (order) => `Untitled ${Math.max(1, Number(order) || 1)}`;
const untitledChapterTitle = (order) => `Untitled Chapter ${Math.max(1, Number(order) || 1)}`;

function nextUntitledProjectTitle() {
  const used = new Set(load().projects.map((project) => String(project.title || "").trim()));
  let order = 1;
  while (used.has(untitledProjectTitle(order))) order += 1;
  return untitledProjectTitle(order);
}

export function words(text) {
  if (!text) return 0;
  const m = String(text).match(ENGLISH_WORD);
  return m ? m.length : 0;
}

export function chars(text) {
  return text ? text.length : 0;
}

export function readingTime(n, kind = "book") {
  const count = Math.max(0, Number(n) || 0);
  if (!count) return "0 sec";
  const wordsPerMinute = kind === "script" ? 180 : 225;
  const seconds = Math.max(5, Math.ceil((count / wordsPerMinute) * 60));
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5} sec`;
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

export function dayKey(ts) {
  const d = new Date(ts);
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function emptyState() {
  return {
    projects: [],
    notes: [],
    history: {},
    revisions: {},
    prefs: { dailyGoal: 750, typeface: "prose" },
  };
}

function seed() {
  const t = now();
  const day = 86400000;
  return {
    projects: [
      {
        id: "p-orbit",
        title: "The Orbit of Hesiod",
        kind: "book",
        archived: false,
        characters: [
          { id: "ch-vera", name: "Vera Kallas", role: "Archaeologist, 41",
            notes: "Competent before she is doubtful. She trusts her instruments more than her colleagues, and that is both her strength and the thing that isolates her in act two.",
            updated: t - day * 3 },
          { id: "ch-dimitri", name: "Dimitri Sarris", role: "Epigrapher, 58",
            notes: "Reads the fragment as literature, not as data. He is the one who says the sentence that reframes the whole book, and he says it while looking at his coffee.",
            updated: t - day * 9 },
        ],
        target: 80000,
        synopsis:
          "An archaeologist discovers that the farming calendar in a poem from 700 BC " +
          "describes a sky that never stood over Greece — and that someone, at some " +
          "point, corrected the stars.",
        created: t - day * 61,
        updated: t - day * 0.2,
        chapters: [
          {
            id: "c1", title: "The Error in the Sky", status: "final", updated: t - day * 12,
            notes: "Establish her competence before any doubt. The reader has to believe the reading before doubting the text.",
            text:
`# The Error in the Sky

The first thing Vera noticed was not the star. It was the space where the star should have been.

The fragment had sat under glass for forty years, catalogued, photographed and cited in two hundred papers, and in none of them had anyone noticed that the Pleiades rose in the wrong line. She measured again. She measured a third time, against the calibration rule, against the 1961 photograph, against her own transcription made that morning with a steady hand.

The sky was wrong by eleven degrees.

Eleven degrees is a great deal. Eleven degrees is the difference between planting and losing the harvest, between sailing and running aground. A poet who was wrong by eleven degrees would not be copied by thirty generations of farmers who depended on him to eat.

"Did you measure from the corner?" Dimitri asked, without looking up from his coffee.

"I measured from everything."

He looked up.`,
          },
          {
            id: "c2", title: "Calibration", status: "revised", updated: t - day * 4,
            notes: "Technical chapter. Careful not to turn it into a lecture: every fact has to cost her something.",
            text:
`# Calibration

The lab was in the basement because the temperature there varied by less than half a degree a year, and because nobody wanted to be there.

Vera built the model three times. The first time, she assumed the error was the copyist's. The second, that it was hers. The third, she let the sky run free and asked the program one thing only: in what year, and seen from where, would that sky be correct?

The answer took four seconds and she stared at it for eleven minutes.`,
          },
          {
            id: "c3", title: "The Copyist", status: "draft", updated: t - day * 0.2,
            notes: "",
            text:
`# The Copyist

`,
          },
        ],
      },
      {
        id: "p-signal",
        title: "Weak Signal",
        kind: "script",
        archived: false,
        characters: [
          { id: "ch-mara", name: "Mara", role: "Radio operator, 34",
            notes: "Never panics on air. The horror has to land in what she does with her hands, not in her voice.",
            updated: t - day * 2 },
        ],
        target: 20000,
        synopsis:
          "Short film. A radio operator at a weather station in the South Atlantic " +
          "starts receiving her own voice six hours late.",
        created: t - day * 23,
        updated: t - day * 2,
        chapters: [
          {
            id: "s1", title: "Scene 1 — Interior / Cabin", status: "revised", updated: t - day * 2,
            notes: "Screenplay: the monospaced setting is the trade standard, not decoration.",
            text:
`INT. RADIO CABIN — NIGHT

A room the size of a closet. Metal panels, analogue dials, a window beaten by rain. MARA (34) wears headphones, a notebook open, writing numbers.

MARA
(into the microphone)
Delta Station, twenty-three hundred bulletin. Pressure nine eight seven, falling.

She releases the button. Static.

Then, quietly, in her own voice:

VOICE (V.O.)
Delta Station, twenty-three hundred bulletin.

Mara stops writing. She does not take off the headphones.`,
          },
          {
            id: "s2", title: "Scene 2 — Exterior / Walkway", status: "draft", updated: t - day * 5,
            notes: "",
            text:
`EXT. STATION WALKWAY — CONTINUOUS

`,
          },
        ],
      },
    ],
    notes: [
      { id: "n-sky", projectId: "p-orbit", title: "The eleven degrees have to be checkable",
        body: "A reader who knows astronomy will run the numbers. Precession is about one degree every seventy-two years, so eleven degrees is roughly eight hundred years of drift. That puts the sky at around 1500 BC, which is the date the plot needs. Keep the arithmetic consistent everywhere it appears.",
        updated: t - day * 1 },
      { id: "n-ending", projectId: "p-orbit", title: "Two endings on the table",
        body: "Either the copyist corrected an older poem to match his own sky, or the poem was always describing a sky someone else had seen. The first is a story about scholarship. The second is a story about contact. Decide before chapter six — they need different setups.",
        updated: t - day * 6 },
      { id: "n-craft", projectId: null, title: "Read the dialogue out loud",
        body: "Anything that cannot be said in one breath gets cut. This has caught more bad lines than any other pass.",
        updated: t - day * 11 },
    ],
    history: {
      [dayKey(t - day * 5)]: 640,
      [dayKey(t - day * 4)]: 1180,
      [dayKey(t - day * 3)]: 300,
      [dayKey(t - day * 2)]: 1425,
      [dayKey(t - day * 1)]: 890,
    },
    prefs: { dailyGoal: 750, typeface: "prose" },
  };
}

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : emptyState();
  } catch (e) {
    cache = emptyState();
  }
  if (!cache.prefs) cache.prefs = { dailyGoal: 750, typeface: "prose" };
  if (!cache.history) cache.history = {};
  if (!cache.revisions || typeof cache.revisions !== "object") cache.revisions = {};
  if (!cache.projects) cache.projects = [];
  if (!cache.notes) cache.notes = [];
  let migrated = false;
  cache.projects.forEach((p) => {
    if (!String(p.title || "").trim() || p.title === "Untitled") {
      p.title = nextUntitledProjectTitle();
      migrated = true;
    }
    if (typeof p.archived !== "boolean") p.archived = false;
    if (!Array.isArray(p.characters)) p.characters = [];
    (p.chapters || []).forEach((chapter, index) => {
      const title = String(chapter.title || "").trim();
      if (!title || title === "Untitled" || /^Untitled \d+$/.test(title) || /^(Chapter|Scene) \d+$/.test(title)) {
        chapter.title = untitledChapterTitle(index + 1);
        migrated = true;
      }
    });
    const profileKey = Object.hasOwn(MANUSCRIPT_PROFILES, p.composition?.profile)
      ? p.composition.profile
      : p.kind === "script" ? "script" : "prose";
    p.composition = { ...MANUSCRIPT_PROFILES[profileKey], ...(p.composition || {}), profile: profileKey };
  });
  if (migrated) save();
  return cache;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("marzel:data-changed"));
    return true;
  } catch (e) {
    if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("marzel:save-failed", { detail: e }));
    return false;
  }
}

export function storageUsage() {
  const bytes = new Blob([JSON.stringify(load())]).size;
  const limit = 5 * 1024 * 1024;
  return { bytes, limit, ratio: Math.min(1, bytes / limit) };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function exportState() {
  return structuredClone(load());
}

export function replaceState(next) {
  if (!next || !Array.isArray(next.projects) || !Array.isArray(next.notes) || typeof next.history !== "object") return false;
  next.projects.forEach((project) => {
    (project.chapters || []).forEach((chapter) => { chapter.html = sanitizeHtml(chapter.html); });
  });
  Object.values(next.revisions || {}).forEach((list) => {
    (list || []).forEach((revision) => { revision.html = sanitizeHtml(revision.html); });
  });
  cache = next;
  load();
  save();
  return true;
}

export function resetLocalState() {
  cache = emptyState();
  save();
}

export function chapterRevisions(projectId, chapterId) {
  return (load().revisions?.[`${projectId}:${chapterId}`] || []).slice();
}

export function checkpointChapter(projectId, chapterId) {
  const current = chapter(projectId, chapterId);
  if (!current) return null;
  const key = `${projectId}:${chapterId}`;
  const revision = {
    id: `r-${uid()}`,
    savedAt: now(),
    title: current.title,
    text: current.text,
    html: current.html || "",
    notes: current.notes || "",
    status: current.status,
  };
  const previous = load().revisions[key]?.[0];
  if (previous && ["title", "text", "html", "notes", "status"].every((field) => previous[field] === revision[field])) return previous;
  load().revisions[key] = [revision, ...(load().revisions[key] || [])].slice(0, 20);
  save();
  return revision;
}

export function restoreChapterRevision(projectId, chapterId, revisionId) {
  const revision = chapterRevisions(projectId, chapterId).find((item) => item.id === revisionId);
  if (!revision) return false;
  writeChapter(projectId, chapterId, {
    title: revision.title,
    text: revision.text,
    html: revision.html,
    notes: revision.notes,
    status: revision.status,
    trackWords: false,
  });
  return true;
}

export function projects() {
  return load().projects.filter((p) => !p.archived);
}

export function allProjects() {
  return load().projects;
}

export function archivedProjects() {
  return load().projects.filter((p) => p.archived);
}

export function archiveProject(id) {
  const p = load().projects.find((x) => x.id === id);
  if (!p) return;
  p.archived = true;
  p.updated = now();
  save();
}

export function restoreProject(id) {
  const p = load().projects.find((x) => x.id === id);
  if (!p) return;
  p.archived = false;
  p.updated = now();
  save();
}

export function draftChapters() {
  const out = [];
  projects().forEach((p) =>
    p.chapters.forEach((c) => {
      if (c.status === "draft") out.push({ project: p, chapter: c });
    })
  );
  return out.sort((a, b) => b.chapter.updated - a.chapter.updated);
}

export function characters(projectId) {
  const p = project(projectId);
  return p ? p.characters : [];
}

export function allCharacters() {
  const out = [];
  projects().forEach((p) => p.characters.forEach((c) => out.push({ project: p, character: c })));
  return out.sort((a, b) => b.character.updated - a.character.updated);
}

export function chapterNotes() {
  const out = [];
  projects().forEach((p) => p.chapters.forEach((c) => {
    if ((c.notes || "").trim()) out.push({ project: p, chapter: c });
  }));
  return out.sort((a, b) => b.chapter.updated - a.chapter.updated);
}

export function createCharacter(projectId, { name, role, notes }) {
  const p = project(projectId);
  if (!p) return null;
  const c = {
    id: "ch-" + uid(),
    name: (name || "").trim() || "Unnamed",
    role: (role || "").trim(),
    notes: (notes || "").trim(),
    updated: now(),
  };
  p.characters.unshift(c);
  save();
  return c;
}

export function updateCharacter(projectId, characterId, patch) {
  const p = project(projectId);
  const c = p && p.characters.find((x) => x.id === characterId);
  if (!c) return;
  Object.assign(c, patch);
  c.updated = now();
  save();
}

export function deleteCharacter(projectId, characterId) {
  const p = project(projectId);
  if (!p) return;
  p.characters = p.characters.filter((c) => c.id !== characterId);
  save();
}

export function notes() {
  return load().notes.slice().sort((a, b) => b.updated - a.updated);
}

export function createNote({ title, body, projectId }) {
  const n = {
    id: "n-" + uid(),
    title: (title || "").trim() || "Untitled note",
    body: (body || "").trim(),
    projectId: projectId || null,
    updated: now(),
  };
  load().notes.unshift(n);
  save();
  return n;
}

export function updateNote(id, patch) {
  const n = load().notes.find((x) => x.id === id);
  if (!n) return;
  Object.assign(n, patch);
  n.updated = now();
  save();
}

export function deleteNote(id) {
  const d = load();
  d.notes = d.notes.filter((n) => n.id !== id);
  save();
}

export function search(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  const excerpt = (text) => {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return "";
    const start = Math.max(0, i - 40);
    return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 60).replace(/\s+/g, " ").trim() + "…";
  };

  projects().forEach((p) => {
    if (p.title.toLowerCase().includes(q) || p.synopsis.toLowerCase().includes(q)) {
      hits.push({ kind: "Project", title: p.title, context: p.synopsis ? excerpt(p.synopsis) : "",
                  href: `editor.html?p=${encodeURIComponent(p.id)}&c=${encodeURIComponent(p.chapters[0].id)}`,
                  where: KINDS[p.kind]?.label || p.kind, updated: p.updated });
    }
    p.chapters.forEach((c) => {
      const inTitle = c.title.toLowerCase().includes(q);
      const inText = c.text.toLowerCase().includes(q);
      const inNotes = (c.notes || "").toLowerCase().includes(q);
      if (inTitle || inText || inNotes) {
        const chapterKind = p.kind === "script" ? "Scene" : "Chapter";
        const chapterOrder = `${chapterKind} ${String(p.chapters.findIndex((item) => item.id === c.id) + 1).padStart(2, "0")}`;
        hits.push({ kind: "Chapter", title: p.title,
                    context: inText ? `${chapterOrder} · ${excerpt(c.text)}` : inNotes ? `${chapterOrder} · ${excerpt(c.notes)}` : chapterOrder,
                    href: `editor.html?p=${encodeURIComponent(p.id)}&c=${encodeURIComponent(c.id)}`,
                    where: p.title, updated: c.updated });
      }
    });
    p.characters.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q)) {
        hits.push({ kind: "Character", title: c.name, context: c.notes ? excerpt(c.notes) : c.role,
                    href: `notebook.html?type=character&id=${encodeURIComponent(c.id)}&project=${encodeURIComponent(p.id)}`,
                    where: p.title, updated: c.updated });
      }
    });
  });

  notes().forEach((n) => {
    if (n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)) {
      const p = n.projectId ? project(n.projectId) : null;
      hits.push({ kind: "Note", title: n.title, context: excerpt(n.body),
                  href: `notebook.html?type=note&id=${encodeURIComponent(n.id)}`,
                  where: p ? p.title : "No project", updated: n.updated });
    }
  });

  return hits.sort((a, b) => b.updated - a.updated);
}

export function project(id) {
  return load().projects.find((p) => p.id === id) || null;
}

export function chapter(projectId, chapterId) {
  const p = project(projectId);
  if (!p) return null;
  return p.chapters.find((c) => c.id === chapterId) || null;
}

export function projectWords(p) {
  return p.chapters.reduce((n, c) => n + words(c.text), 0);
}

export function createProject({ title, kind, target, synopsis }) {
  const t = now();
  const p = {
    id: "p-" + uid(),
    analyticsId: analyticsUid(),
    title: String(title || "").trim() || nextUntitledProjectTitle(),
    kind: kind in KINDS ? kind : "book",
    target: Number(target) || KINDS[kind]?.target || 80000,
    synopsis: (synopsis || "").trim(),
    archived: false,
    composition: { ...MANUSCRIPT_PROFILES[kind === "script" ? "script" : "prose"], profile: kind === "script" ? "script" : "prose" },
    characters: [],
    created: t,
    updated: t,
    chapters: [
      {
        id: "c-" + uid(),
        title: untitledChapterTitle(1),
        status: "draft",
        notes: "",
        text: "",
        html: "",
        updated: t,
      },
    ],
  };
  load().projects.unshift(p);
  save();
  return p;
}

export function createImportedProject({ title, kind, chapters, importTree = [] }) {
  const t = now();
  const projectKind = kind in KINDS ? kind : "book";
  const importedChapters = chapters.map((chapter, index) => ({
    id: "c-" + uid(),
    title: (chapter.title || (projectKind === "script" ? `Scene ${index + 1}` : `Chapter ${index + 1}`)).trim(),
    status: "draft",
    notes: "",
    text: String(chapter.text || ""),
    html: sanitizeHtml(chapter.html),
    updated: t,
  }));
  const p = {
    id: "p-" + uid(),
    analyticsId: analyticsUid(),
    title: String(title || "").trim() || nextUntitledProjectTitle(),
    kind: projectKind,
    target: KINDS[projectKind].target,
    synopsis: "",
    archived: false,
    composition: { ...MANUSCRIPT_PROFILES[projectKind === "script" ? "script" : "prose"], profile: projectKind === "script" ? "script" : "prose" },
    characters: [],
    importTree: importTree.map((entry) => ({ path: String(entry.path || ""), kind: entry.kind || "file", size: Number(entry.size) || 0 })),
    created: t,
    updated: t,
    chapters: importedChapters.length ? importedChapters : [{
      id: "c-" + uid(), title: untitledChapterTitle(1),
      status: "draft", notes: "", text: "", html: "", updated: t,
    }],
  };
  load().projects.unshift(p);
  save();
  return p;
}

export function deleteProject(id) {
  const d = load();
  d.projects = d.projects.filter((p) => p.id !== id);
  cache = d;
  save();
}

export function ensureAnalyticsProjectId(projectId) {
  const p = project(projectId);
  if (!p) return "";
  if (!p.analyticsId) {
    p.analyticsId = analyticsUid();
    save();
  }
  return p.analyticsId;
}

export function createChapter(projectId, title) {
  const p = project(projectId);
  if (!p) return null;
  const c = {
    id: "c-" + uid(),
    title: String(title || "").trim() || untitledChapterTitle(p.chapters.length + 1),
    status: "draft",
    notes: "",
    text: "",
    html: "",
    updated: now(),
  };
  p.chapters.push(c);
  p.updated = c.updated;
  save();
  return c;
}

export function createChapterFromText(projectId, { text, html = "", title } = {}) {
  const newChapter = createChapter(projectId, title);
  if (!newChapter) return null;
  writeChapter(projectId, newChapter.id, { text: String(text || ""), html, trackWords: false });
  return chapter(projectId, newChapter.id);
}

export function deleteChapter(projectId, chapterId) {
  const p = project(projectId);
  if (!p || p.chapters.length <= 1 || !p.chapters.some((c) => c.id === chapterId)) return false;
  p.chapters = p.chapters.filter((c) => c.id !== chapterId);
  p.updated = now();
  save();
  return true;
}

export function moveChapter(projectId, chapterId, delta) {
  const p = project(projectId);
  if (!p) return;
  const i = p.chapters.findIndex((c) => c.id === chapterId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.chapters.length) return;
  const [c] = p.chapters.splice(i, 1);
  p.chapters.splice(j, 0, c);
  p.updated = now();
  save();
}

export function writeChapter(projectId, chapterId, { text, html, title, status, notes, trackWords = true }) {
  const p = project(projectId);
  const c = chapter(projectId, chapterId);
  if (!p || !c) return;

  if (typeof text === "string") {
    const before = words(c.text);
    const after = words(text);
    c.text = text;
    const delta = after - before;
    if (trackWords && delta > 0) {
      const k = dayKey(now());
      load().history[k] = (load().history[k] || 0) + delta;
    }
  }
  if (typeof html === "string") c.html = html;
  if (typeof title === "string") c.title = title.trim() || untitledChapterTitle(p.chapters.findIndex((item) => item.id === c.id) + 1);
  if (typeof status === "string") c.status = status;
  if (typeof notes === "string") c.notes = notes;

  c.updated = now();
  p.updated = c.updated;
  return save();
}

export function updateProject(id, patch) {
  const p = project(id);
  if (!p) return;
  Object.assign(p, patch);
  p.updated = now();
  save();
}

export function todayWords() {
  return load().history[dayKey(now())] || 0;
}

export function streak() {
  const h = load().history;
  const day = 86400000;
  let t = now();
  if (!h[dayKey(t)]) t -= day;
  let n = 0;
  while (h[dayKey(t)]) { n++; t -= day; }
  return n;
}

export function totalWords() {
  return projects().reduce((n, p) => n + projectWords(p), 0);
}

export function prefs() {
  return load().prefs;
}

export function setPref(k, v) {
  load().prefs[k] = v;
  save();
}

const RELATIVE_LIMIT = 30 * 86400000;

export function relTime(ts) {
  const s = Math.floor((now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "min";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d";
  return new Date(ts).toLocaleDateString("en-US", { day: "2-digit", month: "short" });
}

export function editedLabel(ts) {
  const text = relTime(ts);
  if (text === "now") return "edited just now";
  return now() - ts < RELATIVE_LIMIT ? `edited ${text} ago` : `edited on ${text}`;
}

export function fmt(n) {
  return n.toLocaleString("en-US");
}
