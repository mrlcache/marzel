import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("stray top-level text is wrapped back into a paragraph", async () => {
  const [editor, css] = await Promise.all([read("editor.js"), read("editor.css")]);

  assert.match(css, /\.doc>p[^{]*\{[^}]*white-space:\s*pre-wrap/);

  assert.match(css, /\.doc>p[^{]*\{[^}]*text-indent:\s*var\(--prose-indent\)/);
  assert.doesNotMatch(css, /\.doc>p\+\s?p[^{]*\{[^}]*text-indent/);

  assert.match(editor, /function wrapStrayText\(\)/);
  assert.match(editor, /nodeType === 3 && node\.textContent\.trim\(\)/);
  assert.match(editor, /doc\.addEventListener\("input", \(\) => \{ wrapStrayText\(\)/);

  const load = editor.slice(editor.indexOf("function load()"));
  assert.match(load.slice(0, 400), /wrapStrayText\(\)/);

  assert.match(editor, /node\.replaceWith\(block\);\s*block\.appendChild\(node\)/);
  assert.match(editor, /selection\.addRange\(range\)/);
});
