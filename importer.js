import * as db from "./store.js";
import { toast } from "./shell.js";
import { trackImport, trackProjectCreated } from "./analytics.js";

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "fountain", "fdx", "docx", "odt", "rtf"]);
const SCRIPT_EXTENSIONS = new Set(["fountain", "fdx"]);

const extension = (path) => {
  const file = String(path || "").split("/").pop() || "";
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
};

const safePath = (path) => String(path || "")
  .replace(/\\/g, "/")
  .split("/")
  .filter((part) => part && part !== "." && part !== "..")
  .join("/");

const decode = (bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

const decodeXml = (source) => String(source || "")
  .replace(/<(?:w:br|w:cr|text:line-break)\b[^>]*>/gi, "\n")
  .replace(/<w:tab\b[^>]*>/gi, "\t")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&amp;/gi, "&");

const titleFromPath = (path) => {
  const name = (safePath(path).split("/").pop() || "Imported manuscript").replace(/\.[^.]+$/, "");
  return name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Imported manuscript";
};

function parseRtf(source) {
  return String(source || "")
    .replace(/\\par[d]?\s?/gi, "\n\n")
    .replace(/\\line\s?/gi, "\n")
    .replace(/\\tab\s?/gi, "\t")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d*\s?/gi, "")
    .replace(/[{}]/g, "");
}

function parseFdx(source) {
  const paragraphs = [...String(source || "").matchAll(/<Paragraph\b[^>]*>([\s\S]*?)<\/Paragraph>/gi)]
    .map((match) => decodeXml(match[1]));
  return paragraphs.join("\n\n");
}

function parseDocx(source) {
  const paragraphs = [...String(source || "").matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi)]
    .map((match) => decodeXml(match[1]));
  return paragraphs.join("\n\n");
}

function parseOdt(source) {
  const paragraphs = [...String(source || "").matchAll(/<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/gi)]
    .map((match) => decodeXml(match[1]));
  return paragraphs.join("\n\n");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed ZIP files.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i += 1) {
    if (view.getUint32(i, true) === 0x06054b50) end = i;
  }
  if (end < 0) throw new Error("The archive is not a valid ZIP file.");
  const total = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries = [];
  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The ZIP directory could not be read.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const rawPath = decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const normalizedPath = safePath(rawPath);
    const path = rawPath.endsWith("/") && normalizedPath ? `${normalizedPath}/` : normalizedPath;
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!path || rawPath.endsWith("/")) {
      if (path) entries.push({ path, kind: "directory", size: 0, data: new Uint8Array() });
      continue;
    }
    if (flags & 1) throw new Error(`Encrypted ZIP entries are not supported (${path}).`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`The ZIP entry ${path} is invalid.`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`The ZIP compression used by ${path} is not supported.`);
    entries.push({ path, kind: "file", size, data });
  }
  return entries;
}

export function isSupportedImport(path) {
  return TEXT_EXTENSIONS.has(extension(path));
}

export async function parseImportedEntry(entry) {
  const ext = extension(entry.path);
  if (!isSupportedImport(entry.path)) return null;
  let text = decode(entry.data);
  if (ext === "fdx") text = parseFdx(text);
  if (ext === "rtf") text = parseRtf(text);
  if (ext === "docx" || ext === "odt") {
    const files = await unzipEntries(entry.data);
    const xml = ext === "docx"
      ? files.find((file) => file.path === "word/document.xml")
      : files.find((file) => file.path === "content.xml");
    if (!xml) throw new Error(`${entry.path} does not contain its document text.`);
    text = ext === "docx" ? parseDocx(decode(xml.data)) : parseOdt(decode(xml.data));
  }
  return { title: titleFromPath(entry.path), text, kind: SCRIPT_EXTENSIONS.has(ext) ? "script" : "book" };
}

async function entriesFromFiles(files) {
  const list = Array.from(files || []);
  const entries = [];
  for (const file of list) {
    const path = safePath(file.webkitRelativePath || file.name);
    const data = new Uint8Array(await file.arrayBuffer());
    if (extension(path) === "zip") entries.push(...await unzipEntries(data));
    else entries.push({ path, kind: "file", size: data.byteLength, data });
  }
  return entries;
}

export async function importDroppedFiles(files) {
  const incoming = Array.from(files || []);
  if (!incoming.length) throw new Error("Choose a manuscript or ZIP archive to import.");
  const entries = await entriesFromFiles(incoming);
  const chapters = [];
  for (const entry of entries) {
    if (entry.kind !== "file" || entry.path.startsWith("__MACOSX/")) continue;
    const chapter = await parseImportedEntry(entry);
    if (chapter) chapters.push(chapter);
  }
  if (!chapters.length) throw new Error("No supported writing files were found. Use TXT, Markdown, RTF, DOCX, ODT, FDX, Fountain or ZIP.");
  const kind = chapters.every((chapter) => chapter.kind === "script") ? "script" : "book";
  const project = db.createImportedProject({
    title: "",
    kind,
    chapters,
    importTree: entries.map((entry) => ({ path: entry.path, kind: entry.kind, size: entry.size })),
  });
  const sourceFormats = [...new Set(incoming.map((file) => extension(file.name)))];
  trackProjectCreated(project, "imported");
  trackImport({ format: sourceFormats.length === 1 ? sourceFormats[0] : "mixed", wordCount: chapters.reduce((total, chapter) => total + db.words(chapter.text), 0), project });
  return project;
}

export async function importAndOpen(files) {
  const project = await importDroppedFiles(files);
  const chapter = project.chapters[0];
  location.href = `editor.html?p=${encodeURIComponent(project.id)}&c=${encodeURIComponent(chapter.id)}`;
}

let mounted = false;

export function mountFileImport() {
  if (mounted) return;
  mounted = true;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".txt,.md,.markdown,.rtf,.docx,.odt,.fdx,.fountain,.zip";
  input.className = "sr-only";
  input.setAttribute("aria-label", "Import manuscript files");
  const overlay = document.createElement("div");
  overlay.className = "drop-import";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `<span class="lab solid">Import manuscript</span><b>Drop files to create a project</b><p>TXT, Markdown, RTF, DOCX, ODT, FDX, Fountain or ZIP</p>`;
  document.body.append(input, overlay);
  const open = () => input.click();
  const run = async (files) => {
    overlay.classList.remove("on");
    try { await importAndOpen(files); }
    catch (error) { toast(error.message || "Import could not be completed."); }
  };
  input.addEventListener("change", () => { if (input.files?.length) run(input.files); input.value = ""; });
  document.addEventListener("marzel:open-import", open);
  let dragDepth = 0;
  addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    dragDepth += 1;
    overlay.classList.add("on");
  });
  addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.classList.remove("on");
  });
  addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    run(event.dataTransfer.files);
  });
}
