import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("deletion is specific, confirmed in-app, and directly reachable", async () => {
  const [shell, projects, now, editor] = await Promise.all([read("shell.js"), read("projects.js"), read("now.js"), read("editor.js")]);
  assert.match(shell, /export function confirmAction/);
  assert.match(shell, /role="alertdialog"/);
  assert.doesNotMatch(projects, /\bconfirm\(/);
  assert.doesNotMatch(editor, /\bconfirm\(/);
  assert.match(projects, /data-delete="\$\{esc\(p\.id\)\}"/);
  assert.match(projects, /confirmAction\(/);
  assert.match(editor, /confirmAction\(/);
});

test("the continue list cannot destroy a project from a chapter row", async () => {
  const now = await read("now.js");
  assert.doesNotMatch(now, /data-delete-project/);
  assert.doesNotMatch(now, /deleteProject/);
  assert.match(now, /class="continue-open" href="\$\{editorHref\(p, c\)\}"/);
});

test("the Now preview stays bounded and exposes a large local layout fixture", async () => {
  const [now, product] = await Promise.all([read("now.js"), read("product.css")]);
  assert.match(now, /const NOW_PREVIEW_LIMIT = 4/);
  assert.match(now, /excerpt\.slice\(0, 180\)/);
  assert.match(now, /items\.slice\(0, NOW_PREVIEW_LIMIT\)/);
  assert.match(now, /\["localhost", "127\.0\.0\.1"\]\.includes\(location\.hostname\)/);
  assert.match(now, /Long-form layout test/);
  assert.match(now, /Array\.from\(\{ length: 64 \}/);
  assert.match(product, /\.now-hero \.now-excerpt\{display:block;height:1\.45em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(product, /\.continue-list\{border:1px solid var\(--rule-hard\)\}/);
  assert.match(product, /#next-up\{display:flex;flex-direction:column;min-height:0\}/);
});
