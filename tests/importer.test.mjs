import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};

const db = await import("../store.js");
const { importDroppedFiles, parseImportedEntry, unzipEntries } = await import("../importer.js");
const encoder = new TextEncoder();

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function header(size) { return new Uint8Array(size); }
function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value, true); }

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  files.forEach(({ path, text, directory = false, compressed = false }) => {
    const name = encoder.encode(path);
    const raw = directory ? new Uint8Array() : encoder.encode(text);
    const payload = compressed ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = compressed ? 8 : 0;
    const local = header(30);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50); u16(localView, 4, 20); u16(localView, 8, method);
    u32(localView, 18, payload.length); u32(localView, 22, raw.length); u16(localView, 26, name.length);
    const record = concat([local, name, payload]);
    const directoryEntry = header(46);
    const directoryView = new DataView(directoryEntry.buffer);
    u32(directoryView, 0, 0x02014b50); u16(directoryView, 4, 20); u16(directoryView, 6, 20); u16(directoryView, 10, method);
    u32(directoryView, 20, payload.length); u32(directoryView, 24, raw.length); u16(directoryView, 28, name.length); u32(directoryView, 42, offset);
    locals.push(record); central.push(concat([directoryEntry, name])); offset += record.length;
  });
  const centralBytes = concat(central);
  const end = header(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50); u16(endView, 8, files.length); u16(endView, 10, files.length); u32(endView, 12, centralBytes.length); u32(endView, 16, offset);
  return concat([...locals, centralBytes, end]);
}

function file(name, data) {
  const bytes = data instanceof Uint8Array ? data : encoder.encode(data);
  return { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

test("a dropped text file creates and preserves a new project", async () => {
  const before = db.projects().length;
  const project = await importDroppedFiles([file("A Quiet Tool.md", "# A Quiet Tool\n\nStart with the text.")]);
  assert.equal(db.projects().length, before + 1);
  assert.equal(project.title, "Untitled 1");
  assert.equal(project.chapters[0].text, "# A Quiet Tool\n\nStart with the text.");
  assert.deepEqual(project.importTree.map((entry) => entry.path), ["A Quiet Tool.md"]);
});

test("a compressed ZIP becomes one project and retains paths", async () => {
  const archive = zip([
    { path: "novel/", directory: true },
    { path: "novel/01-opening.md", text: "Opening text.", compressed: true },
    { path: "novel/02-ending.txt", text: "Ending text." },
    { path: "novel/research/image.png", text: "not writing" },
  ]);
  const entries = await unzipEntries(archive);
  assert.deepEqual(entries.map((entry) => entry.path), ["novel/", "novel/01-opening.md", "novel/02-ending.txt", "novel/research/image.png"]);
  const project = await importDroppedFiles([file("novel.zip", archive)]);
  assert.equal(project.chapters.length, 2);
  assert.deepEqual(project.importTree.map((entry) => entry.path), entries.map((entry) => entry.path));
});

test("screenplay source and selected text create chapters without changing the source", async () => {
  const parsed = await parseImportedEntry({ path: "Scene 1.fdx", data: encoder.encode("<FinalDraft><Paragraph><Text>INT. CABIN — NIGHT</Text></Paragraph><Paragraph><Text>MARA waits.</Text></Paragraph></FinalDraft>") });
  assert.equal(parsed.kind, "script");
  assert.equal(parsed.text, "INT. CABIN — NIGHT\n\nMARA waits.");
  const project = db.createProject({ title: "Selection source", kind: "book", target: 1000, synopsis: "" });
  assert.equal(project.chapters[0].title, "Untitled Chapter 1");
  const source = project.chapters[0];
  db.writeChapter(project.id, source.id, { text: "Keep this selected sentence in place." });
  const before = db.chapter(project.id, source.id).text;
  const chapter = db.createChapterFromText(project.id, { text: "selected sentence", html: "<p><strong>selected</strong> sentence</p>" });
  assert.equal(chapter.title, "Untitled Chapter 2");
  assert.equal(db.chapter(project.id, source.id).text, before);
  assert.equal(chapter.text, "selected sentence");
  assert.equal(chapter.html, "<p><strong>selected</strong> sentence</p>");
});

test("a private checkpoint restores a chapter without changing its word history", () => {
  const project = db.createProject({ title: "Checkpoint source", kind: "book", target: 1000, synopsis: "" });
  const chapter = project.chapters[0];
  db.writeChapter(project.id, chapter.id, { text: "The first version.", notes: "Keep this." });
  const checkpoint = db.checkpointChapter(project.id, chapter.id);
  db.writeChapter(project.id, chapter.id, { text: "A later version.", notes: "Replace this." });
  assert.equal(db.restoreChapterRevision(project.id, chapter.id, checkpoint.id), true);
  const restored = db.chapter(project.id, chapter.id);
  assert.equal(restored.text, "The first version.");
  assert.equal(restored.notes, "Keep this.");
});

test("document import preserves leading whitespace, tabs and blank paragraphs", async () => {
  const docx = zip([{ path: "word/document.xml", text: `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t xml:space="preserve">  Opening line</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>\tTabbed line</w:t></w:r></w:p></w:body></w:document>` }]);
  const parsed = await parseImportedEntry({ path: "Spacing.docx", data: docx });
  assert.equal(parsed.text, "  Opening line\n\nSecond paragraph\n\n\n\n\tTabbed line");

  const rtf = await parseImportedEntry({ path: "Spacing.rtf", data: encoder.encode("{\\rtf1   First\\par\\par\\tab Tabbed}") });
  assert.equal(rtf.text, "  First\n\n\n\n\tTabbed");

  const fdx = await parseImportedEntry({ path: "Spacing.fdx", data: encoder.encode("<FinalDraft><Paragraph><Text>  First</Text></Paragraph><Paragraph></Paragraph><Paragraph><Text>\tLast</Text></Paragraph></FinalDraft>") });
  assert.equal(fdx.text, "  First\n\n\n\n\tLast");

  const odt = zip([{ path: "content.xml", text: "<office:document><text:p>  First</text:p><text:p></text:p><text:p>\tLast</text:p></office:document>" }]);
  const odtParsed = await parseImportedEntry({ path: "Spacing.odt", data: odt });
  assert.equal(odtParsed.text, "  First\n\n\n\n\tLast");

  const markdown = await parseImportedEntry({ path: "Spacing.md", data: encoder.encode("  First\n\n\tLast") });
  assert.equal(markdown.text, "  First\n\n\tLast");
});
