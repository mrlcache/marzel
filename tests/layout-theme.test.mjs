import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("standard prose measure is book-like and theme changes use a viewport wipe", async () => {
  const [editorCss, baseCss, shell, now, productCss] = await Promise.all([read("editor.css"), read("base.css"), read("shell.js"), read("now.html"), read("product.css")]);
  assert.match(editorCss, /--sheet-measure:70ch/);
  assert.match(editorCss, /transition:max-width var\(--motion-spatial\) cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(editorCss, /@media \(prefers-reduced-motion:reduce\)\{\.sheet\{transition:none\}\}/);
  assert.match(baseCss, /\.theme-wipe\{position:fixed;top:0;left:0;width:100vw;height:100dvh/);
  assert.match(shell, /wipe\.classList\.add\("run"\)/);
  assert.match(shell, /themeTimer = setTimeout\(\(\) => \{ if \(themeWipe === wipe\) apply\(\); \}, 130\)/);
  assert.match(baseCss, /@keyframes theme-wipe/);
  assert.match(now, /body class="fill-shell now-page"/);
  assert.match(productCss, /body\.now-page\{height:100vh;overflow:hidden\}/);
  assert.match(baseCss, /body\.fill-shell\{height:100vh;overflow:hidden\}/);
  assert.match(baseCss, /body\.fill-shell \.main>\.page\{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden\}/);
});
