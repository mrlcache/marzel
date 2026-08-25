import * as db from "./store.js";

export const NOTEBOOK_FILTERS = Object.freeze([
  ["all", "All"],
  ["note", "Notes"],
  ["chapter-note", "Chapter notes"],
  ["character", "Characters"],
]);

export function notebookRecords() {
  const notes = db.notes().map((note) => ({
    type: "note",
    id: note.id,
    projectId: note.projectId || "",
    title: note.title || "Untitled note",
    body: note.body || "",
    role: "",
    updated: note.updated,
  }));
  const chapterNotes = db.chapterNotes().map(({ project, chapter }) => ({
    type: "chapter-note",
    id: chapter.id,
    projectId: project.id,
    title: chapter.title,
    body: chapter.notes || "",
    role: "",
    updated: chapter.updated,
  }));
  const characters = db.allCharacters().map(({ project, character }) => ({
    type: "character",
    id: character.id,
    projectId: project.id,
    title: character.name,
    body: character.notes || "",
    role: character.role || "",
    updated: character.updated,
  }));
  return [...notes, ...chapterNotes, ...characters].sort((a, b) => b.updated - a.updated);
}

export function notebookTypeLabel(type) {
  return type === "chapter-note" ? "Chapter note" : type === "character" ? "Character" : "Note";
}
