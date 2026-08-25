(() => {
  const root = document.documentElement;
  const output = document.querySelector("[data-button-feedback-output]");
  const wipe = document.querySelector(".theme-wipe");
  const say = (message) => { output.textContent = message; };
  const setReferenceTheme = (mode) => {
    const apply = () => {
      root.setAttribute("data-theme", mode);
      document.querySelectorAll("[data-button-theme]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.buttonTheme === mode)));
      say(`Theme changed to ${mode === "light" ? "Paper" : "Ink"}.`);
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    wipe.classList.remove("run");
    void wipe.offsetWidth;
    wipe.classList.add("run");
    setTimeout(apply, 130);
  };

  document.querySelectorAll("[data-button-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      setReferenceTheme(button.dataset.buttonTheme);
    });
  });

  document.querySelectorAll("[data-button-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!active));
      say(`${button.getAttribute("aria-label")} ${active ? "off" : "on"}.`);
    });
  });

  document.querySelectorAll("[data-button-tabs]").forEach((group) => {
    const buttons = group.matches("button") ? [...group.parentElement.querySelectorAll("button[data-button-tabs]")] : [...group.querySelectorAll("button")];
    buttons.forEach((button) => button.addEventListener("click", () => {
      buttons.forEach((item) => {
        if (item.hasAttribute("aria-selected")) item.setAttribute("aria-selected", String(item === button));
        if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(item === button));
      });
      say(`${button.textContent.trim()} selected.`);
    }));
  });

  document.querySelectorAll("[data-button-feedback]").forEach((button) => button.addEventListener("click", () => say(button.dataset.buttonFeedback)));

  document.querySelectorAll("[data-reference-row]").forEach((row) => row.addEventListener("click", () => say(`${row.textContent.trim().replace(/\s+/g, " ")} selected.`)));

  document.querySelectorAll("[data-reference-note]").forEach((note) => note.addEventListener("click", () => {
    document.querySelectorAll("[data-reference-note]").forEach((item) => item.setAttribute("aria-current", String(item === note)));
    say(`${note.querySelector("h2").textContent} selected.`);
  }));

  document.querySelectorAll("[data-reference-length]").forEach((reference) => reference.addEventListener("click", () => {
    document.querySelectorAll("[data-reference-length]").forEach((item) => item.setAttribute("aria-pressed", String(item === reference)));
    say(`${reference.querySelector("b").textContent} selected.`);
  }));

  const replay = () => {
    const progress = document.querySelector("[data-motion-progress]");
    const drawer = document.querySelector("[data-motion-drawer]");
    const toolbar = document.querySelector("[data-motion-toolbar]");
    drawer.classList.remove("is-open");
    toolbar.classList.remove("is-open");
    progress.style.width = "0";
    requestAnimationFrame(() => {
      progress.style.width = "68%";
      drawer.classList.add("is-open");
      toolbar.classList.add("is-open");
    });
    say("Motion replayed.");
  };
  document.querySelector("[data-motion-replay]").addEventListener("click", replay);
  document.querySelector("[data-motion-wipe]").addEventListener("click", () => {
    setReferenceTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
  document.querySelector("[data-motion-drawer-toggle]").addEventListener("click", () => document.querySelector("[data-motion-drawer]").classList.toggle("is-open"));
  document.querySelector("[data-motion-toolbar-toggle]").addEventListener("click", () => document.querySelector("[data-motion-toolbar]").classList.toggle("is-open"));
  document.querySelector("[data-motion-toast]").addEventListener("click", () => {
    const toast = document.querySelector("[data-reference-toast]");
    toast.classList.add("on");
    setTimeout(() => toast.classList.remove("on"), 1800);
    say("Save confirmation shown.");
  });

  document.querySelectorAll("a[data-button-feedback]").forEach((link) => link.addEventListener("click", (event) => event.preventDefault()));
})();
