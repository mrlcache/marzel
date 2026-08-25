const BACKUP_FORMAT = "marzel-backup";
const BACKUP_VERSION = 1;
const encoder = new TextEncoder();
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const safeName = (value, fallback = "manuscript") => String(value || fallback)
  .trim()
  .replace(/[\\/:*?"<>|]/g, "-")
  .replace(/\s+/g, " ")
  .slice(0, 80) || fallback;

function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character]));

function fallbackChapterHtml(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  const addParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${escapeHtml(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  };
  lines.forEach((line) => {
    if (line === "") {
      if (paragraph.length) addParagraph();
      else blocks.push("<p><br></p>");
    } else paragraph.push(line);
  });
  addParagraph();
  return blocks.join("");
}

function chapterHtml(chapter) {
  return String(chapter.html || "").trim() || fallbackChapterHtml(chapter.text);
}

function exportComposition(project) {
  const saved = project.composition || {};
  const script = saved.profile === "script" || (!saved.profile && project.kind === "script");
  const font = script ? "mono" : (saved.font === "sans" ? "sans" : "serif");
  const scale = saved.scale === "compact" || saved.scale === "large" ? saved.scale : "standard";
  const measure = saved.measure === "narrow" || saved.measure === "wide" ? saved.measure : "standard";
  const paragraphs = saved.paragraphs === "compact" || saved.paragraphs === "relaxed" ? saved.paragraphs : "regular";
  return {
    script,
    font,
    fontFamily: script ? '"IBM Plex Mono", "Courier New", monospace' : font === "sans" ? '"Space Grotesk", Arial, sans-serif' : '"Source Serif 4", Georgia, serif',
    fontName: script ? "IBM Plex Mono" : font === "sans" ? "Space Grotesk" : "Source Serif 4",
    fontSize: script ? 14 : ({ compact: 18, standard: 20, large: 22 })[scale],
    wordSize: script ? 22 : ({ compact: 27, standard: 30, large: 33 })[scale],
    lineHeight: script ? 1.75 : 1.72,
    measure: ({ narrow: 50, standard: 70, wide: 78 })[measure],
    indent: script || paragraphs === "compact" ? "0" : paragraphs === "relaxed" ? "2em" : "1.25em",
    wordIndent: script || paragraphs === "compact" ? 0 : paragraphs === "relaxed" ? 576 : 360,
  };
}

function manuscriptSections(project) {
  const noun = project.kind === "script" ? "Scene" : "Chapter";
  return (project.chapters || []).map((chapter, index) => {
    const title = chapter.title || `${noun} ${index + 1}`;
    return `<section class="chapter"><h2>${escapeHtml(title)}</h2><div class="chapter-body">${chapterHtml(chapter)}</div></section>`;
  }).join("\n");
}

export function projectStyledHtml(project) {
  const composition = exportComposition(project);
  const title = project.title || "Untitled";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page{margin:22mm 21mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#17130f;font-family:${composition.fontFamily};font-size:${composition.fontSize}px;line-height:${composition.lineHeight};-webkit-font-smoothing:antialiased}.manuscript{width:100%;max-width:${composition.measure}ch;margin:0 auto}.manuscript-title{margin:0 0 3.2rem;font-family:${composition.fontFamily};font-size:${composition.script ? "1.65rem" : "2.45rem"};font-weight:600;line-height:1.08;letter-spacing:-.025em}.chapter{break-before:page;page-break-before:always}.chapter:first-of-type{break-before:auto;page-break-before:auto}.chapter h2{margin:0 0 2rem;font-family:${composition.fontFamily};font-size:${composition.script ? ".83rem" : "1.2rem"};font-weight:600;line-height:1.2;letter-spacing:${composition.script ? ".06em" : "-.015em"};text-transform:${composition.script ? "uppercase" : "none"}.chapter-body>p,.chapter-body>div{margin:0;line-height:${composition.lineHeight};white-space:pre-wrap;tab-size:4;text-indent:${composition.indent}}.chapter-body b,.chapter-body strong{font-weight:700}.chapter-body i,.chapter-body em{font-style:italic}@media screen{body{padding:clamp(24px,6vw,80px)}}
</style></head><body><article class="manuscript"><h1 class="manuscript-title">${escapeHtml(title)}</h1>${manuscriptSections(project)}</article></body></html>`;
}

export function downloadProjectHtml(project) {
  download(`${safeName(project.title)}.html`, "text/html;charset=utf-8", projectStyledHtml(project));
}

function fallbackWordBlocks(text) {
  const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return paragraphs.map((paragraph) => ({ runs: paragraph.split("\n").flatMap((line, index) => index ? [{ break: true }, { text: line }] : [{ text: line }]) }));
}

function nodeRuns(nodes, inherited = {}, output = []) {
  [...nodes].forEach((node) => {
    if (node.nodeType === 3) {
      if (node.nodeValue) output.push({ text: node.nodeValue, ...inherited });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") { output.push({ break: true }); return; }
    const style = node.getAttribute("style") || "";
    const emphasis = {
      bold: inherited.bold || tag === "b" || tag === "strong" || /font-weight\s*:\s*(bold|[5-9]00)/i.test(style),
      italic: inherited.italic || tag === "i" || tag === "em" || /font-style\s*:\s*italic/i.test(style),
    };
    nodeRuns(node.childNodes, emphasis, output);
  });
  return output;
}

function wordBlocks(chapter) {
  if (!String(chapter.html || "").trim() || typeof DOMParser === "undefined") return fallbackWordBlocks(chapter.text);
  const body = new DOMParser().parseFromString(`<body>${chapter.html}</body>`, "text/html").body;
  const blocks = [...body.children].filter((element) => /^(P|DIV)$/i.test(element.tagName))
    .map((element) => ({ runs: nodeRuns(element.childNodes) }));
  return blocks.length ? blocks : [{ runs: nodeRuns(body.childNodes) }];
}

function wordRun(run, defaults) {
  if (run.break) return "<w:r><w:br/></w:r>";
  const properties = [
    `<w:rFonts w:ascii="${escapeXml(defaults.fontName)}" w:hAnsi="${escapeXml(defaults.fontName)}"/>`,
    `<w:sz w:val="${defaults.wordSize}"/><w:szCs w:val="${defaults.wordSize}"/>`,
    run.bold ? "<w:b/>" : "",
    run.italic ? "<w:i/>" : "",
  ].join("");
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text || "")}</w:t></w:r>`;
}

function wordParagraph(runs, composition, { heading = false, title = false, pageBreak = false } = {}) {
  const size = title ? composition.wordSize + 18 : heading ? composition.wordSize + 6 : composition.wordSize;
  const spacing = Math.round((size / 2) * 20 * (heading || title ? 1.2 : composition.lineHeight));
  const properties = heading || title
    ? `<w:pPr>${pageBreak ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="${title ? 0 : 360}" w:after="${title ? 600 : 320}" w:line="${spacing}" w:lineRule="auto"/><w:keepNext/></w:pPr>`
    : `<w:pPr><w:spacing w:line="${spacing}" w:lineRule="auto"/>${composition.wordIndent ? `<w:ind w:firstLine="${composition.wordIndent}"/>` : ""}</w:pPr>`;
  const styled = runs.map((run) => wordRun(run, { ...composition, wordSize: size })).join("") || wordRun({ text: "" }, { ...composition, wordSize: size });
  return `<w:p>${properties}${styled}</w:p>`;
}

function docxDocument(project) {
  const composition = exportComposition(project);
  const noun = project.kind === "script" ? "Scene" : "Chapter";
  const chapters = (project.chapters || []).flatMap((chapter, index) => [
    wordParagraph([{ text: chapter.title || `${noun} ${index + 1}`, bold: true }], composition, { heading: true, pageBreak: index > 0 }),
    ...wordBlocks(chapter).map((block) => wordParagraph(block.runs, composition)),
  ]).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${wordParagraph([{ text: project.title || "Untitled", bold: true }], composition, { title: true })}${chapters}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1260" w:right="1260" w:bottom="1260" w:left="1260"/></w:sectPr></w:body></w:document>`;
}

export function projectDocxEntries(project) {
  return [
    { path: "[Content_Types].xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>" },
    { path: "_rels/.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>" },
    { path: "word/document.xml", content: docxDocument(project) },
  ];
}

export function projectDocxBlob(project) {
  return new Blob([projectDocxBytes(project)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function projectDocxBytes(project) {
  return zip(projectDocxEntries(project));
}

export function downloadProjectDocx(project) {
  download(`${safeName(project.title)}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", projectDocxBlob(project));
}

export function printProject(project) {
  if (typeof window === "undefined") return false;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(projectStyledHtml(project));
  printWindow.document.close();
  const print = () => { printWindow.focus(); printWindow.print(); };
  printWindow.addEventListener("load", () => setTimeout(print, 120), { once: true });
  return true;
}

export function projectMarkdown(project) {
  const frontMatter = [
    "---",
    `title: ${JSON.stringify(project.title || "Untitled")}`,
    `format: ${project.kind || "book"}`,
    "---",
  ].join("\n");
  const chapters = (project.chapters || []).map((chapter) => {
    const heading = project.kind === "script" ? `# ${chapter.title || "Untitled scene"}` : `# ${chapter.title || "Untitled chapter"}`;
    return `${heading}\n\n${String(chapter.text || "").trimEnd()}`.trimEnd();
  }).join("\n\n");
  return `${frontMatter}\n\n${chapters}\n`;
}

export function cleanProjectMarkdown(project) {
  const projectTitle = project.title || "Untitled";
  const chapterLabel = project.kind === "script" ? "Scene" : "Chapter";
  const chapters = (project.chapters || []).map((chapter, index) => {
    const title = chapter.title || `${chapterLabel} ${index + 1}`;
    return `## ${title}\n\n${String(chapter.text || "").trimEnd()}`.trimEnd();
  }).join("\n\n");
  return `# ${projectTitle}\n\n${chapters}\n`;
}

export function downloadProjectMarkdown(project) {
  download(`${safeName(project.title)}.md`, "text/markdown;charset=utf-8", projectMarkdown(project));
}

export function chapterMarkdown(project, chapter, index) {
  const heading = project.kind === "script" ? "Scene" : "Chapter";
  return [
    "---",
    `title: ${JSON.stringify(chapter.title || `Untitled ${heading.toLowerCase()}`)}`,
    `project: ${JSON.stringify(project.title || "Untitled")}`,
    `position: ${index + 1}`,
    "---",
    "",
    `# ${chapter.title || `${heading} ${index + 1}`}`,
    "",
    String(chapter.text || "").trimEnd(),
    "",
  ].join("\n");
}

export function projectArchiveEntries(project) {
  const projectName = safeName(project.title).replace(/\s+/g, "-").toLowerCase();
  const chapters = project.chapters || [];
  return [
    {
      path: "README.md",
      content: `# ${project.title || "Untitled"}\n\nThis package contains a complete manuscript in \`manuscript.md\` and each chapter in \`chapters/\`.\n`,
    },
    { path: "manuscript.md", content: projectMarkdown(project) },
    {
      path: "project.json",
      content: `${JSON.stringify({ title: project.title, kind: project.kind, target: project.target, synopsis: project.synopsis }, null, 2)}\n`,
    },
    ...chapters.map((chapter, index) => ({
      path: `chapters/${String(index + 1).padStart(2, "0")}-${projectName}-${safeName(chapter.title || `chapter-${index + 1}`).replace(/\s+/g, "-").toLowerCase()}.md`,
      content: chapterMarkdown(project, chapter, index),
    })),
  ];
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function joinBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = typeof entry.content === "string" ? encoder.encode(entry.content) : new Uint8Array(entry.content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localHeader.set(name, 30);
    local.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    central.push(centralHeader);
    offset += localHeader.byteLength + data.byteLength;
  }
  const directory = joinBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directory.byteLength, true);
  endView.setUint32(16, offset, true);
  return joinBytes([...local, directory, end]);
}

export function projectArchiveBlob(project) {
  return new Blob([zip(projectArchiveEntries(project))], { type: "application/zip" });
}

export function downloadProjectArchive(project) {
  download(`${safeName(project.title)}-manuscript.zip`, "application/zip", projectArchiveBlob(project));
}

export function backupPayload(state) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

export function downloadBackup(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`marzel-backup-${stamp}.marzel`, "application/json;charset=utf-8", `${JSON.stringify(backupPayload(state), null, 2)}\n`);
}

export function libraryArchiveEntries(state) {
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  const occupied = new Set();
  const fileName = (project, index) => {
    const base = safeName(project.title || `Untitled project ${index + 1}`)
      .replace(/\s+/g, "-")
      .toLowerCase();
    let candidate = `${String(index + 1).padStart(2, "0")}-${base}.md`;
    let copy = 2;
    while (occupied.has(candidate)) candidate = `${String(index + 1).padStart(2, "0")}-${base}-${copy++}.md`;
    occupied.add(candidate);
    return candidate;
  };
  return [
    {
      path: "backup/marzel-backup.marzel",
      content: `${JSON.stringify(backupPayload(state), null, 2)}\n`,
    },
    ...projects.map((project, index) => ({
      path: `projects/${fileName(project, index)}`,
      content: cleanProjectMarkdown(project),
    })),
  ];
}

export function libraryArchiveBlob(state) {
  return new Blob([zip(libraryArchiveEntries(state))], { type: "application/zip" });
}

export function downloadLibraryArchive(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`marzel-library-${stamp}.zip`, "application/zip", libraryArchiveBlob(state));
}

export function formattedLibraryArchiveEntries(state, format = "docx") {
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  const selected = format === "html" ? "html" : "docx";
  const occupied = new Set();
  return projects.map((project, index) => {
    const base = safeName(project.title || `Untitled project ${index + 1}`).replace(/\s+/g, "-").toLowerCase();
    let file = `${String(index + 1).padStart(2, "0")}-${base}.${selected}`;
    let copy = 2;
    while (occupied.has(file)) file = `${String(index + 1).padStart(2, "0")}-${base}-${copy++}.${selected}`;
    occupied.add(file);
    return {
      path: `projects/${file}`,
      content: selected === "html" ? projectStyledHtml(project) : projectDocxBytes(project),
    };
  });
}

export function formattedLibraryArchiveBlob(state, format) {
  return new Blob([zip(formattedLibraryArchiveEntries(state, format))], { type: "application/zip" });
}

export function downloadFormattedLibraryArchive(state, format) {
  const selected = format === "html" ? "html" : "word";
  const stamp = new Date().toISOString().slice(0, 10);
  download(`marzel-${selected}-manuscripts-${stamp}.zip`, "application/zip", formattedLibraryArchiveBlob(state, format));
}

export async function readBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.format !== BACKUP_FORMAT || parsed?.version !== BACKUP_VERSION || !parsed.data) throw new Error("invalid_backup");
  return parsed.data;
}
