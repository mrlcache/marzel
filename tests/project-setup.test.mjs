import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("book setup offers familiar length references without replacing the editable target", async () => {
  const [projects, css, store, importer, now] = await Promise.all([read("projects.js"), read("product.css"), read("store.js"), read("importer.js"), read("now.js")]);

  assert.match(projects, /The Stranger/);
  assert.match(projects, /1984/);
  assert.match(projects, /War and Peace/);
  assert.match(projects, /data-reference-words/);
  assert.match(projects, /id="project-target" type="number"/);
  assert.match(projects, /referenceField\.hidden = kind !== "book"/);
  assert.match(projects, /target\.addEventListener\("input", syncLengthReferences\)/);
  assert.match(projects, /data-manage-rename/);
  assert.match(projects, /db\.updateProject\(project\.id, \{ title \}\)/);
  assert.match(css, /\.length-reference-list/);
  assert.match(css, /\.manage-name-trigger/);
  assert.match(projects, /Project name <span style="opacity:.6">— optional<\/span>/);
  assert.match(projects, /placeholder="Enter a project name"/);
  assert.doesNotMatch(projects, /Give the manuscript a title/);
  assert.match(store, /const untitledChapterTitle = \(order\) => `Untitled Chapter \$\{Math\.max\(1, Number\(order\) \|\| 1\)\}`/);
  assert.match(store, /String\(title \|\| ""\)\.trim\(\) \|\| nextUntitledProjectTitle\(\)/);
  assert.match(store, /untitledChapterTitle\(p\.chapters\.length \+ 1\)/);
  assert.match(importer, /title: ""/);
  assert.match(now, /<h2>\$\{esc\(project\.title\)\}<\/h2>/);
  assert.match(now, /<b>\$\{esc\(p\.title\)\}<\/b>/);
  assert.doesNotMatch(now, /<b>\$\{esc\(c\.title\)\}<\/b>/);
});
