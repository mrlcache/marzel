import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const roots = [".", "worker/src", "scripts"];
const files = [];
for (const root of roots) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js") || entry.isFile() && entry.name.endsWith(".mjs")) files.push(resolve(root, entry.name));
  }
}
const run = promisify(execFile);
for (const file of files) await run(process.execPath, ["--check", file]);
console.log(`Syntax checked ${files.length} JavaScript files.`);
