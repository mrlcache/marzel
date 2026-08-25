import assert from "node:assert/strict";
import test from "node:test";
import { backupPayload, formattedLibraryArchiveEntries, libraryArchiveBlob, libraryArchiveEntries, projectArchiveBlob, projectArchiveEntries, projectDocxBlob, projectStyledHtml, projectMarkdown } from "../exporter.js";
import { unzipEntries } from "../importer.js";

test("portable exports preserve a readable manuscript and a restorable library", async () => {
  const project = {
    title: "A Quiet Book",
    kind: "book",
    chapters: [
      { title: "Chapter 1", text: "First paragraph.\n\nSecond paragraph." },
      { title: "Chapter 2", text: "The ending." },
    ],
  };
  const markdown = projectMarkdown(project);
  assert.match(markdown, /title: "A Quiet Book"/);
  assert.match(markdown, /# Chapter 1/);
  assert.match(markdown, /Second paragraph\./);
  assert.match(markdown, /# Chapter 2/);

  const archiveEntries = projectArchiveEntries(project);
  assert.deepEqual(archiveEntries.map((entry) => entry.path), [
    "README.md",
    "manuscript.md",
    "project.json",
    "chapters/01-a-quiet-book-chapter-1.md",
    "chapters/02-a-quiet-book-chapter-2.md",
  ]);
  const zipEntries = await unzipEntries(new Uint8Array(await projectArchiveBlob(project).arrayBuffer()));
  const zipPaths = zipEntries.map((entry) => entry.path);
  assert.ok(zipPaths.includes("manuscript.md"));
  assert.ok(zipPaths.includes("chapters/01-a-quiet-book-chapter-1.md"));
  const merged = new TextDecoder().decode(zipEntries.find((entry) => entry.path === "manuscript.md").data);
  assert.match(merged, /# Chapter 1/);
  assert.match(merged, /# Chapter 2/);

  const state = { projects: [project], notes: [], history: {}, revisions: {}, prefs: { dailyGoal: 750 } };
  const backup = backupPayload(state);
  assert.equal(backup.format, "marzel-backup");
  assert.equal(backup.version, 1);
  assert.deepEqual(backup.data, state);
});

test("a library export includes recovery data and a clean manuscript per project", async () => {
  const state = {
    projects: [
      {
        title: "A Quiet Book",
        kind: "book",
        chapters: [
          { title: "Opening", text: "First paragraph." },
          { title: "Ending", text: "Last paragraph." },
        ],
      },
      {
        title: "Radio Play",
        kind: "script",
        chapters: [{ title: "Scene 1", text: "INT. STUDIO - NIGHT" }],
      },
    ],
    notes: [], history: {}, revisions: {}, prefs: { dailyGoal: 750 },
  };
  const entries = libraryArchiveEntries(state);
  assert.deepEqual(entries.map((entry) => entry.path), [
    "backup/marzel-backup.marzel",
    "projects/01-a-quiet-book.md",
    "projects/02-radio-play.md",
  ]);
  assert.doesNotMatch(entries[1].content, /^---/);
  assert.match(entries[1].content, /## Opening/);
  assert.match(entries[1].content, /## Ending/);
  assert.match(entries[1].content, /First paragraph\./);
  assert.match(entries[1].content, /Last paragraph\./);

  const archive = await unzipEntries(new Uint8Array(await libraryArchiveBlob(state).arrayBuffer()));
  const backupFile = archive.find((entry) => entry.path === "backup/marzel-backup.marzel");
  const manuscript = archive.find((entry) => entry.path === "projects/01-a-quiet-book.md");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(backupFile.data)).data, state);
  assert.match(new TextDecoder().decode(manuscript.data), /## Ending/);
});

test("formatted exports keep manuscript composition in HTML and valid Word packages", async () => {
  const project = {
    title: "The Form of Things",
    kind: "book",
    composition: { profile: "prose", font: "sans", scale: "large", measure: "wide", paragraphs: "relaxed" },
    chapters: [{ title: "Opening", text: "A bold thought.", html: "<p>A <strong>bold</strong> and <em>italic</em> thought.</p>" }],
  };
  const html = projectStyledHtml(project);
  assert.match(html, /font-family:"Space Grotesk", Arial, sans-serif/);
  assert.match(html, /font-size:22px/);
  assert.match(html, /text-indent:2em/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);

  const wordEntries = await unzipEntries(new Uint8Array(await projectDocxBlob(project).arrayBuffer()));
  assert.deepEqual(wordEntries.map((entry) => entry.path), ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  const documentXml = new TextDecoder().decode(wordEntries.find((entry) => entry.path === "word/document.xml").data);
  assert.match(documentXml, /The Form of Things/);
  assert.match(documentXml, /Opening/);
  assert.match(documentXml, /w:firstLine="576"/);

  const state = { projects: [project], notes: [], history: {}, revisions: {}, prefs: { dailyGoal: 750 } };
  const docxLibrary = formattedLibraryArchiveEntries(state, "docx");
  const htmlLibrary = formattedLibraryArchiveEntries(state, "html");
  assert.equal(docxLibrary[0].path, "projects/01-the-form-of-things.docx");
  assert.ok(docxLibrary[0].content instanceof Uint8Array);
  assert.equal(htmlLibrary[0].path, "projects/01-the-form-of-things.html");
  assert.match(htmlLibrary[0].content, /The Form of Things/);
});
