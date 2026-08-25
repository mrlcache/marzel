import * as db from "./store.js";
import { confirmAction, mount, toast } from "./shell.js";
import { account, beginSignIn, cloudState, saveCloudState, signOut } from "./account.js";
import { downloadFormattedLibraryArchive, downloadLibraryArchive, readBackup } from "./exporter.js";
import { renderShell, setHead, page, acts } from "./chrome.js";
import { analytics, markCloudEnabled } from "./analytics.js";

renderShell("account.html");
setHead("Account", "Optional cloud backup");
acts().innerHTML = `<a class="btn ghost" href="now.html">Back to Writer</a>`;

const stamp = (value) => value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not saved yet";

function storageLine() {
  const { bytes, limit, ratio } = db.storageUsage();
  const percent = Math.max(1, Math.round(ratio * 100));
  const tight = ratio > 0.8;
  return `<div class="account-storage"><div class="account-storage-head"><span class="lab">Browser storage</span><span class="mono num">${db.formatBytes(bytes)} of ~${db.formatBytes(limit)}</span></div><div class="quota"><i style="width:${percent}%"></i></div><p class="account-fine">${tight
    ? "This browser is nearly full. Export a recovery package and clear finished projects before writing more."
    : "Chapters, checkpoints and notes share this space. Export a recovery package if it fills up."}</p></div>`;
}

async function resetLocalWriting() {
  const accepted = await confirmAction({
    title: "Clear local writing?",
    message: "This removes every project, chapter, note and daily total from this browser. A cloud copy, if you made one, is not changed.",
    confirmLabel: "Clear this browser",
    cancelLabel: "Keep writing",
  });
  if (!accepted) return;
  db.resetLocalState();
  toast("This browser is ready for a new manuscript.");
  location.href = "projects.html?new=1";
}

function mountLocalReset(card) {
  card.querySelector("[data-clear-local]")?.addEventListener("click", resetLocalWriting);
}

function analyticsControl() {
  return `<div class="account-local"><div><span class="lab">Product analytics</span><p>Only aggregate product events are collected. Manuscript text and titles are never sent.</p></div><button class="btn ghost" type="button" data-analytics-opt-out${analytics.isOptedOut() ? " disabled" : ""}>${analytics.isOptedOut() ? "Analytics disabled" : "Disable analytics"}</button></div>`;
}

function mountAnalyticsControl(card) {
  card.querySelector("[data-analytics-opt-out]")?.addEventListener("click", () => {
    analytics.optOut();
    toast("Product analytics disabled in this browser.");
    render();
  });
}

function openLibraryExportDialog() {
  const opener = document.activeElement;
  const layer = document.createElement("div");
  layer.className = "modal library-export-modal";
  layer.innerHTML = `<section class="modal-box wipe" role="dialog" aria-modal="true" aria-labelledby="library-export-title" aria-describedby="library-export-copy"><div class="modal-head"><span class="lab solid">Export library</span><button class="btn ghost tiny" type="button" data-library-export-close>Close</button></div><div class="modal-body"><h2 class="library-export-title" id="library-export-title">Choose how the library travels.</h2><p class="library-export-copy" id="library-export-copy">Every formatted package keeps one complete manuscript per project. Each file contains that project’s chapters in order.</p><div class="library-export-options"><button class="library-export-option" type="button" data-library-export="backup"><span class="library-export-option-title">Recovery package <b>.zip</b></span><span>A complete Marzel backup plus clean Markdown manuscripts. Use it when you need to restore this browser.</span></button><button class="library-export-option" type="button" data-library-export="docx"><span class="library-export-option-title">Word manuscripts <b>.zip</b></span><span>One editable .docx per project, preserving the manuscript’s type, spacing, indentation and emphasis.</span></button><button class="library-export-option" type="button" data-library-export="html"><span class="library-export-option-title">Styled / PDF-ready <b>.zip</b></span><span>One exact-looking .html document per project. Open any file and choose Save as PDF when you need a fixed copy.</span></button></div></div><div class="modal-foot"><button class="btn ghost" type="button" data-library-export-close>Cancel</button></div></section>`;
  document.body.appendChild(layer);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    layer.remove();
    if (opener instanceof HTMLElement) opener.focus();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...layer.querySelectorAll("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  layer.querySelectorAll("[data-library-export-close]").forEach((button) => button.addEventListener("click", close));
  layer.addEventListener("mousedown", (event) => { if (event.target === layer) close(); });
  layer.querySelectorAll("[data-library-export]").forEach((button) => button.addEventListener("click", () => {
    const format = button.dataset.libraryExport;
    const state = db.exportState();
    if (format === "backup") {
      downloadLibraryArchive(state);
      toast("Recovery package downloaded.");
    } else {
      downloadFormattedLibraryArchive(state, format);
      toast(`${format === "docx" ? "Word" : "Styled"} manuscript package downloaded.`);
    }
    close();
  }));
  document.addEventListener("keydown", onKeydown);
  layer.querySelector("[data-library-export]").focus();
}

function mountPortability(card) {
  card.querySelector("[data-download-backup]")?.addEventListener("click", () => {
    openLibraryExportDialog();
  });
  const input = card.querySelector("[data-restore-backup]");
  card.querySelector("[data-choose-backup]")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const state = await readBackup(file);
      const accepted = await confirmAction({
        title: "Use this backup?",
        message: "The projects and notes currently in this browser will be replaced by this Marzel backup.",
        confirmLabel: "Use backup",
        cancelLabel: "Keep this browser",
      });
      if (!accepted) return;
      if (!db.replaceState(state)) throw new Error("invalid_backup");
      toast("Backup restored to this browser.");
      location.href = "now.html";
    } catch {
      toast("That file is not a valid Marzel backup.");
    }
  });
}

const portability = `<div class="account-portability" id="portable-writing"><div><span class="lab">Your writing, portable</span><p>Export a recovery copy or one formatted manuscript per project whenever you need it.</p></div><div class="account-actions"><button class="btn ghost" type="button" data-download-backup>Export library</button><button class="btn ghost" type="button" data-choose-backup>Restore backup</button><input hidden type="file" accept=".marzel,application/json" data-restore-backup></div></div>`;

function renderAnonymous(card) {
  card.innerHTML = `<div class="account-card-head"><span class="lab solid">Cloud backup</span><span class="mono">Optional</span></div><div class="account-card-body"><h3>Sign in when the manuscript needs to travel.</h3><p>Your writing remains available here either way. Google is used only to identify your private backup.</p><div class="account-providers"><button class="provider" type="button" data-provider="google"><b>G</b><span>Continue with Google</span></button></div><p class="account-fine">No password is stored by Marzel.</p>${portability}${storageLine()}${analyticsControl()}<div class="account-local"><div><span class="lab">This browser</span><p>Remove the old sample work and start with a blank page.</p></div><button class="btn ghost" type="button" data-clear-local>Clear local writing</button></div></div>`;
  card.querySelectorAll("[data-provider]").forEach((button) => button.addEventListener("click", () => beginSignIn(button.dataset.provider)));
  mountLocalReset(card);
  mountPortability(card);
  mountAnalyticsControl(card);
}

function renderSignedIn(card, user, remote) {
  const cloudReady = remote !== undefined;
  const cloudLabel = remote?.updatedAt ? "Saved" : cloudReady ? "Not saved yet" : "Checking cloud copy";
  const cloudCopy = remote?.updatedAt ? `Last saved ${stamp(remote.updatedAt)}.` : cloudReady ? "Save this browser when you are ready." : "Your writing remains available on this device.";
  card.innerHTML = `<div class="account-card-head"><span class="lab solid">Signed in</span><button class="btn ghost tiny" type="button" data-sign-out>Sign out</button></div><div class="account-card-body"><div class="account-user"><span class="account-avatar">${(user.name || user.email || "M").slice(0, 1).toUpperCase()}</span><div><h3>${user.name || "Writer"}</h3><p>${user.email || "Private account"}</p></div></div><div class="account-sync"><div><span class="lab">Cloud copy</span><b>${cloudLabel}</b><p>${cloudCopy}</p></div><div class="account-actions"><button class="btn" type="button" data-backup>Back up this device</button>${remote?.data ? `<button class="btn ghost" type="button" data-restore>Use cloud copy</button>` : ""}</div></div>${portability}${storageLine()}${analyticsControl()}<div class="account-local"><div><span class="lab">This browser</span><p>Clear local projects without changing the cloud copy.</p></div><button class="btn ghost" type="button" data-clear-local>Clear local writing</button></div></div>`;
  card.querySelector("[data-sign-out]").addEventListener("click", async () => { await signOut(); toast("Signed out. Your local writing stays here."); render(); });
  card.querySelector("[data-backup]").addEventListener("click", async () => {
    try { await saveCloudState(db.exportState(), remote?.revision); markCloudEnabled(); toast("Cloud copy saved."); render(); }
    catch (error) { toast(error.status === 409 ? "The cloud copy changed. Review it before saving again." : "Cloud backup could not be saved."); }
  });
  card.querySelector("[data-restore]")?.addEventListener("click", async () => {
    if (!await confirmAction({ title: "Use cloud copy?", message: "The writing currently in this browser will be replaced by the saved cloud copy.", confirmLabel: "Use cloud copy", cancelLabel: "Keep this device" })) return;
    if (db.replaceState(remote.data)) { toast("Cloud copy loaded into this browser."); location.href = "now.html"; }
  });
  mountLocalReset(card);
  mountPortability(card);
  mountAnalyticsControl(card);
}

async function render() {
  page().innerHTML = `<section class="account-page"><span class="lab">Account</span><h2>Keep the writing yours.<br>Take it with you when you need to.</h2><p class="account-intro">Marzel works without an account. Signing in adds a private cloud copy for this browser and any other device you choose.</p><div class="account-card" id="account-card"></div></section>`;
  const card = document.getElementById("account-card");
  renderAnonymous(card);
  const user = await account();
  if (!user) return;
  renderSignedIn(card, user);
  try { renderSignedIn(card, user, await cloudState()); }
  catch { toast("Cloud backup is unavailable right now."); renderSignedIn(card, user, null); }
}

mount();
render();

const authResult = new URLSearchParams(location.search).get("auth");
if (authResult === "connected") toast("Account connected.");
if (authResult === "failed") toast("Sign-in could not be completed.");
if (authResult) history.replaceState(null, "", "account.html");
