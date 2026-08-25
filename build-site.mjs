import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const root = resolve(".");
const out = resolve(root, "dist");
const deployableExtensions = new Set([".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".txt", ".xml"]);

if (!out.startsWith(`${root}\\`) && !out.startsWith(`${root}/`)) throw new Error("Refusing to clear a path outside this project.");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile() && (deployableExtensions.has(extname(entry.name)) || entry.name === "_headers" || entry.name === "_redirects"));
await Promise.all(files.map((entry) => cp(resolve(root, entry.name), resolve(out, entry.name))));

const analyticsConfig = {
  enabled: process.env.MARZEL_ANALYTICS_ENABLED === "true",
  environment: ["development", "preview", "production", "test"].includes(process.env.MARZEL_ANALYTICS_ENVIRONMENT) ? process.env.MARZEL_ANALYTICS_ENVIRONMENT : "production",
  appVersion: process.env.MARZEL_APP_VERSION || process.env.CF_PAGES_COMMIT_SHA || "unknown",
  posthogApiKey: process.env.MARZEL_POSTHOG_PROJECT_API_KEY || "",
  posthogApiHost: process.env.MARZEL_POSTHOG_API_HOST || "https://us.i.posthog.com",
};
await writeFile(resolve(out, "analytics-config.js"), `export const analyticsConfig = Object.freeze(${JSON.stringify(analyticsConfig, null, 2)});\n`);

const buildId = Date.now().toString(36);
const version = (path) => `${path}?v=${buildId}`;
const compiledFiles = await readdir(out, { withFileTypes: true });
await Promise.all(compiledFiles.filter((entry) => [".html", ".js"].includes(extname(entry.name))).map(async (entry) => {
  const path = resolve(out, entry.name);
  let source = await readFile(path, "utf8");
  if (extname(entry.name) === ".html") {
    source = source.replace(/\b(src|href)="([\w-]+\.(?:js|css))"/g, (_, attribute, asset) => `${attribute}="${version(asset)}"`);
  } else {
    source = source
      .replace(/(\bfrom\s+["'])(\.\/[^"']+\.js)(["'])/g, (_, before, asset, after) => `${before}${version(asset)}${after}`)
      .replace(/(\bimport\s*\(\s*["'])(\.\/[^"']+\.js)(["'])/g, (_, before, asset, after) => `${before}${version(asset)}${after}`);
  }
  await writeFile(path, source);
}));

console.log(`Prepared ${files.length} public files in dist (build ${buildId}).`);
