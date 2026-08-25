# Marzel

Marzel is a local-first writing workspace for long-form work.

Website: <https://marzel.space>

## What it includes

- Projects for books, screenplays, stories and essays.
- Chapters, notes, chapter notes and characters in one workspace.
- A manuscript editor with formatting, status and writing context.
- Local storage with export options.
- Optional account and cloud backup.
- Import for TXT, Markdown, RTF, DOCX, ODT, FDX, Fountain and ZIP files.

Marzel does not use generative AI to write the manuscript. The writer works
directly with the text.

## Local development

The Writer is a static browser application with a small local server:

```bash
node serve.mjs
```

It opens at <http://localhost:5180>. The server is required because the
application uses ES modules and browser security blocks them when opened with
`file://`.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Account and cloud API

The optional API is in `worker/` and runs on Cloudflare Workers. Its
configuration uses environment secrets only. Copy
`worker/.dev.vars.example` for local setup and never commit populated secret
files.

The API expects:

- a Neon `DATABASE_URL`;
- a random `SESSION_SECRET`;
- Google OAuth credentials;
- an optional PostHog project ingestion key.

The client analytics allow-list excludes manuscript text, titles, notes,
characters, emails and raw account identifiers.

## Project layout

- `index.html` — public landing page.
- `now.html` — current writing view.
- `projects.html` — project management.
- `notebook.html` — notes and characters.
- `editor.html` — manuscript editor.
- `account.html` — optional account and backup.
- `store.js` — local manuscript data and writing state.
- `importer.js` — document and archive import.
- `exporter.js` — portable manuscript exports.
- `worker/` — optional account and cloud API.

## Design system

Marzel uses a restrained monochrome system:

- Paper and Ink themes;
- square corners;
- hairline dividers;
- Space Grotesk for interface text;
- Source Serif 4 for manuscript text;
- IBM Plex Mono for labels and numbers.

The manuscript and the next writing action remain more prominent than
operational metrics.
