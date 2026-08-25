import { mountTheme } from "./shell.js";
import { trackLandingView } from "./analytics.js";

mountTheme();
trackLandingView();

const sampleProject = {
  chapters: {
    c1: {
      title: "The Error in the Sky",
      status: "Final",
      words: 157,
      paragraphs: [
        "The first thing Vera noticed was not the star. It was the space where the star should have been.",
        "The fragment had sat under glass for forty years, catalogued, photographed and cited in two hundred papers, and in none of them had anyone noticed that the Pleiades rose in the wrong line.",
        "She measured again. She measured a third time, against the calibration rule, against her own transcription made that morning with a steady hand.",
      ],
      note: "Establish her competence before any doubt. The reader has to believe the reading before doubting the text.",
    },
    c2: {
      title: "Calibration",
      status: "Revised",
      words: 89,
      paragraphs: [
        "The lab was in the basement because the temperature there varied by less than half a degree a year, and because nobody wanted to be there.",
        "Vera built the model three times. The first time, she assumed the error was the copyist's. The second, that it was hers. The third, she let the sky run free.",
        "The answer took four seconds and she stared at it for eleven minutes.",
      ],
      note: "Technical chapter. Careful not to turn it into a lecture: every fact has to cost her something.",
    },
    c3: {
      title: "The Copyist",
      status: "Draft",
      words: 2,
      paragraphs: ["The next chapter is ready for its first sentence."],
      note: "No chapter note yet. Add one from the chapter inspector when the draft needs it.",
    },
  },
  character: {
    title: "Vera Kallas",
    label: "Character",
    text: "Archaeologist, 41. Competent before she is doubtful. She trusts her instruments more than her colleagues.",
  },
  notes: {
    sky: {
      title: "The eleven degrees have to be checkable",
      text: "Precession is about one degree every seventy-two years, so eleven degrees is roughly eight hundred years of drift.",
    },
    ending: {
      title: "Two endings on the table",
      text: "Decide before chapter six. The two possibilities need different setups.",
    },
  },
};

function previewManuscript() {
  const preview = document.querySelector("[data-manuscript-preview]");
  if (!preview) return;

  let chapterId = "c1";
  let reference = "character";
  const title = preview.querySelector("[data-preview-title]");
  const barTitle = preview.querySelector("[data-preview-bar-title]");
  const meta = preview.querySelector("[data-preview-meta]");
  const prose = preview.querySelector("[data-preview-prose]");
  const referenceBody = preview.querySelector("[data-preview-reference-body]");
  const pageLabel = preview.querySelector("[data-preview-label]");

  function drawReference() {
    const chapter = sampleProject.chapters[chapterId];
    const data = reference === "character"
      ? sampleProject.character
      : { label: "Chapter note", title: chapter.title, text: chapter.note };
    referenceBody.classList.add("is-changing");
    referenceBody.replaceChildren();
    const label = document.createElement("small");
    const heading = document.createElement("b");
    const body = document.createElement("p");
    label.textContent = data.label;
    heading.textContent = data.title;
    body.textContent = data.text;
    referenceBody.append(label, heading, body);
    requestAnimationFrame(() => referenceBody.classList.remove("is-changing"));
  }

  function drawChapter() {
    const chapter = sampleProject.chapters[chapterId];
    title.textContent = chapter.title;
    barTitle.textContent = chapter.title;
    meta.innerHTML = `The Orbit of Hesiod <span>&middot;</span> Book <span>&middot;</span> ${chapter.status}`;
    pageLabel.textContent = chapter.status === "Draft" ? "Ready to write" : "Continue writing";
    prose.replaceChildren(...chapter.paragraphs.map((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      return element;
    }));
    preview.querySelectorAll("[data-preview-chapter]").forEach((button) => {
      const active = button.dataset.previewChapter === chapterId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    drawReference();
  }

  preview.querySelectorAll("[data-preview-chapter]").forEach((button) => {
    button.addEventListener("click", () => {
      chapterId = button.dataset.previewChapter;
      drawChapter();
    });
  });
  preview.querySelectorAll("[data-preview-reference]").forEach((button) => {
    button.addEventListener("click", () => {
      reference = button.dataset.previewReference;
      preview.querySelectorAll("[data-preview-reference]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      drawReference();
    });
  });
}

function projectLibrary() {
  const demo = document.querySelector("[data-library-demo]");
  if (!demo) return;

  const groups = {
    chapters: [
      { id: "c1", name: "01  The Error in the Sky", label: "Chapter note", title: "The Error in the Sky", text: sampleProject.chapters.c1.note, href: "editor.html?p=p-orbit&c=c1", action: "Open chapter" },
      { id: "c2", name: "02  Calibration", label: "Chapter note", title: "Calibration", text: sampleProject.chapters.c2.note, href: "editor.html?p=p-orbit&c=c2", action: "Open chapter" },
      { id: "c3", name: "03  The Copyist", label: "Chapter note", title: "The Copyist", text: sampleProject.chapters.c3.note, href: "editor.html?p=p-orbit&c=c3", action: "Open chapter" },
    ],
    characters: [
      { id: "vera", name: "Vera Kallas", label: "Character", title: "Vera Kallas", text: sampleProject.character.text, href: "notebook.html?type=character&id=ch-vera&project=p-orbit", action: "Open character" },
      { id: "dimitri", name: "Dimitri Sarris", label: "Character", title: "Dimitri Sarris", text: "Epigrapher, 58. Reads the fragment as literature, not as data.", href: "notebook.html?type=character&id=ch-dimitri&project=p-orbit", action: "Open character" },
    ],
    notes: [
      { id: "sky", name: "The eleven degrees", label: "Project note", title: sampleProject.notes.sky.title, text: sampleProject.notes.sky.text, href: "notebook.html?type=note&id=n-sky", action: "Open note" },
      { id: "ending", name: "Two endings", label: "Project note", title: sampleProject.notes.ending.title, text: sampleProject.notes.ending.text, href: "notebook.html?type=note&id=n-ending", action: "Open note" },
    ],
  };
  const items = demo.querySelector("[data-library-items]");
  const detail = demo.querySelector("[data-library-detail]");
  let group = "chapters";
  let itemId = "c1";

  function drawDetail() {
    const item = groups[group].find((entry) => entry.id === itemId) || groups[group][0];
    detail.classList.add("is-changing");
    detail.replaceChildren();
    const label = document.createElement("span");
    const heading = document.createElement("h4");
    const copy = document.createElement("p");
    const link = document.createElement("a");
    label.className = "lab";
    label.textContent = item.label;
    heading.textContent = item.title;
    copy.textContent = item.text;
    link.href = item.href;
    link.textContent = `${item.action} →`;
    detail.append(label, heading, copy, link);
    requestAnimationFrame(() => detail.classList.remove("is-changing"));
  }

  function drawItems() {
    items.replaceChildren(...groups[group].map((item) => {
      const button = document.createElement("button");
      const active = item.id === itemId;
      button.className = `demo-item${active ? " is-active" : ""}`;
      button.type = "button";
      button.dataset.libraryItem = item.id;
      button.setAttribute("aria-current", String(active));
      button.textContent = item.name;
      button.addEventListener("click", () => {
        itemId = item.id;
        drawItems();
        drawDetail();
      });
      return button;
    }));
  }

  demo.querySelectorAll("[data-library-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      group = button.dataset.libraryTab;
      itemId = groups[group][0].id;
      demo.querySelectorAll("[data-library-tab]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      drawItems();
      drawDetail();
    });
  });
}

previewManuscript();
projectLibrary();
