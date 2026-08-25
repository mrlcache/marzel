import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("account UI keeps local writing optional and exposes real provider routes", async () => {
  const [accountPage, account, store, chrome, now, headers, worker, schema, build] = await Promise.all([
    read("account-page.js"), read("account.js"), read("store.js"), read("chrome.js"), read("now.js"), read("_headers"), read("worker/src/index.js"), read("worker/schema.sql"), read("build-site.mjs"),
  ]);

  assert.match(accountPage, /Continue with Google/);
  assert.doesNotMatch(accountPage, /Apple/);
  assert.match(accountPage, /Marzel works without an account/);
  assert.match(accountPage, /db\.exportState\(\)/);
  assert.match(accountPage, /db\.replaceState\(remote\.data\)/);
  assert.match(accountPage, /Clear local writing/);
  assert.match(accountPage, /Export library/);
  assert.match(accountPage, /Restore backup/);
  assert.doesNotMatch(accountPage, /Checking account/);
  assert.match(accountPage, /renderAnonymous\(card\)/);
  assert.match(accountPage, /downloadLibraryArchive/);
  assert.match(accountPage, /downloadFormattedLibraryArchive/);
  assert.match(accountPage, /openLibraryExportDialog/);
  assert.match(account, /REQUEST_TIMEOUT = 4500/);
  assert.match(account, /controller\.abort/);
  assert.match(account, /Account & backup/);
  assert.match(account, /location\.assign\(`\/api\/auth\/\$\{provider\}`\)/);
  assert.match(store, /export function exportState/);
  assert.match(store, /export function replaceState/);
  assert.match(store, /export function resetLocalState/);
  assert.match(store, /export function checkpointChapter/);
  assert.match(store, /export function restoreChapterRevision/);
  assert.match(store, /cache = raw \? JSON\.parse\(raw\) : emptyState\(\)/);
  assert.match(chrome, /Account &amp; backup/);
  assert.match(chrome, /href="account\.html"/);
  assert.match(now, /Account &amp; backup/);
  assert.match(headers, /Cache-Control: no-store/);
  assert.match(worker, /\/api\/auth\/google/);
  assert.doesNotMatch(worker, /\/api\/auth\/apple/);
  assert.match(worker, /verifiedJwt/);
  assert.match(schema, /create table if not exists writer_accounts/);
  assert.match(schema, /create table if not exists writer_cloud_state/);
  assert.match(build, /Prepared \$\{files\.length\} public files in dist/);
  assert.doesNotMatch(build, /worker\/node_modules/);
});
