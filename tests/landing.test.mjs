import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("the landing makes the manuscript workflow concrete and keeps Writer local-first", async () => {
  const [landing, css, script, now] = await Promise.all([read("index.html"), read("landing.css"), read("landing.js"), read("now.html")]);

  assert.match(landing, /Write the thing\./);
  assert.match(landing, /Shape the page\./);
  assert.match(landing, /Write now/);
  assert.match(landing, /projects\.html\?new=1/);
  assert.match(landing, /href="now\.html"/);
  assert.match(landing, /href="account\.html">Sign in/);
  assert.match(landing, /class="preview-workspace"/);
  assert.match(landing, /class="preview-chapters"/);
  assert.match(landing, /class="preview-reference"/);
  assert.match(landing, /data-manuscript-preview/);
  assert.match(landing, /data-preview-chapter="c1"/);
  assert.match(landing, /data-library-demo/);
  assert.match(landing, /class="manuscript-feature wrap"/);
  assert.match(landing, /More structure than a document\. Less to manage than a writing suite\./);
  assert.doesNotMatch(landing, /data-export-format/);
  assert.doesNotMatch(landing, /Open it and write/);
  assert.doesNotMatch(landing, /Take the work with you/);
  assert.doesNotMatch(landing, /Enough structure\. Nothing to manage\./);
  assert.doesNotMatch(landing, /class="positioning/);
  assert.match(landing, /Built for the moment a small draft becomes a real project\./);
  assert.match(landing, /03 \/ yours to keep/);
  assert.match(landing, /Local by default, portable by design\./);
  assert.match(landing, /Stored locally/);
  assert.match(landing, /No account is needed to begin\. Export individual projects/);
  assert.match(landing, /Chapters, characters, notes and the page itself/);
  assert.match(landing, /chapters, characters, notes, targets/);
  assert.match(landing, /account\.html#portable-writing/);
  assert.doesNotMatch(landing, /style="height:/);
  assert.doesNotMatch(landing, /Stored in your browser/);
  assert.match(landing, /Start with the novel\. Keep the rest open\./);
  assert.doesNotMatch(landing, /From first line to finished file/);
  assert.match(landing, /Your next chapter does not need another setup process\./);
  assert.doesNotMatch(landing, /Marzel Writer \/ early build/);
  assert.doesNotMatch(landing, /—/);
  assert.match(css, /\.landing-hero/);
  assert.match(css, /\.preview-workspace/);
  assert.match(css, /\.preview-chapter:hover/);
  assert.match(css, /\.manuscript-feature\{/);
  assert.match(css, /\.ownership\{/);
  assert.match(css, /--landing-section-space/);
  assert.match(css, /--landing-item-space/);
  assert.match(css, /--landing-copy-gap/);
  assert.match(landing, /class="ownership wrap" id="ownership"/);
  assert.match(landing, /class="ownership-list" role="list"/);
  assert.match(css, /\.ownership-list\{border-top:1px solid var\(--rule-hard\)\}/);
  assert.match(css, /\.landing-close\{margin-top:clamp\(70px,11vw,160px\);padding:clamp\(58px,9vw,124px\)/);
  assert.doesNotMatch(css, /landing-close-message/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(script, /function previewManuscript/);
  assert.match(script, /function projectLibrary/);
  assert.doesNotMatch(script, /function exportPreview/);
  assert.doesNotMatch(script, /alignHeroPreview|style\.height/);
  assert.match(now, /now\.js/);
});

test("the separate button reference exposes the Writer controls in both themes", async () => {
  const [buttons, buttonCss, buttonScript] = await Promise.all([read("buttons.html"), read("buttons.css"), read("buttons.js")]);
  assert.match(buttons, /data-button-theme="light"/);
  assert.match(buttons, /data-button-theme="dark"/);
  assert.match(buttons, /class="btn ghost"/);
  assert.match(buttons, /class="format-btn strong"/);
  assert.match(buttons, /class="icon-btn"/);
  assert.match(buttons, /class="text-action"/);
  assert.match(buttons, /Rows, lists and records/);
  assert.match(buttons, /Every movement in one place/);
  assert.match(buttons, /data-motion-replay/);
  assert.match(buttonCss, /\.button-reference/);
  assert.match(buttonCss, /\.reference-tables/);
  assert.match(buttonCss, /\.motion-reference-frame/);
  assert.match(buttonScript, /data-button-theme/);
  assert.match(buttonScript, /data-button-toggle/);
  assert.match(buttonScript, /data-motion-replay/);
  assert.doesNotMatch(buttonCss, /button-reference-press/);
  assert.match(buttonScript, /event\.preventDefault\(\)/);
});

test("Writer reserves motion for meaningful state and spatial changes", async () => {
  const [base, product, editor, landing, shell, buttons, buttonCss] = await Promise.all([
    read("base.css"),
    read("product.css"),
    read("editor.css"),
    read("landing.css"),
    read("shell.js"),
    read("buttons.js"),
    read("buttons.css"),
  ]);

  assert.match(base, /--motion-wipe:260ms/);
  assert.match(base, /--motion-spatial:180ms/);
  assert.match(base, /--motion-feedback:160ms/);
  assert.match(base, /\.theme-wipe\.run\{animation:theme-wipe var\(--motion-wipe\)/);
  assert.match(shell, /setTimeout\(\(\) => \{ if \(themeWipe === wipe\) apply\(\); \}, 130\)/);
  assert.match(base, /\.quota i\{[^}]*transition:none/);
  assert.match(base, /\.quota\.is-target-change i\{transition:width var\(--motion-spatial\)/);
  assert.match(base, /\.shell aside\{[^}]*transition:transform var\(--motion-spatial\)/);
  assert.match(base, /\.toast\{[^}]*transition:opacity var\(--motion-feedback\)/);
  assert.doesNotMatch(base, /\.tab\{[^}]*transition:/);
  assert.doesNotMatch(base, /\.row-item\{[^}]*transition:/);
  assert.doesNotMatch(base, /\.nav\{[^}]*transition:/);
  assert.doesNotMatch(product, /\.continue-row\{[^}]*transition:/);
  assert.doesNotMatch(product, /\.notebook-row\{[^}]*transition:/);
  assert.doesNotMatch(product, /\.length-reference\{[^}]*transition:/);
  assert.match(editor, /\.sheet\{[^}]*transition:max-width var\(--motion-spatial\)/);
  assert.doesNotMatch(editor, /\.icon-btn\{[^}]*transition:/);
  assert.doesNotMatch(editor, /\.chap\{[^}]*transition:/);
  assert.doesNotMatch(landing, /transform:translateX\(2px\)/);
  assert.match(landing, /\.preview-reference-item\{min-height:126px;transition:opacity var\(--motion-feedback\)/);
  assert.match(buttons, /setTimeout\(apply, 130\)/);
  assert.match(buttonCss, /\.motion-reference-progress \.quota\.is-target-change i/);
  assert.doesNotMatch(buttonCss, /\.motion-reference-card\.wipe/);
});
