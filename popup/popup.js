(function () {
  "use strict";

  const api = globalThis.__shareClean;
  const DEFAULTS = api ? api.DEFAULT_SETTINGS : { enabled: true, stripUtm: true };
  const STORAGE_KEY = "settings";
  const hasStorage =
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.sync &&
    typeof chrome.storage.sync.get === "function";

  const $ = (id) => document.getElementById(id);
  const enabled = $("enabled");
  const enabledHint = $("enabled-hint");
  const utm = $("utm");
  const input = $("input");
  const cleanButton = $("clean");
  const resultWrap = $("result-wrap");
  const result = $("result");
  const copyButton = $("copy");
  const status = $("status");

  let settings = { ...DEFAULTS };
  let copyTimer = 0;

  function save() {
    if (!hasStorage) return;
    try {
      chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    } catch {
      // Preview mode or an invalidated extension context.
    }
  }

  function load() {
    if (!hasStorage) return Promise.resolve(settings);

    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULTS }, (stored) => {
          if (!chrome.runtime.lastError && stored && stored[STORAGE_KEY]) {
            settings = { ...DEFAULTS, ...stored[STORAGE_KEY] };
          }
          resolve(settings);
        });
      } catch {
        resolve(settings);
      }
    });
  }

  function render() {
    enabled.checked = settings.enabled !== false;
    utm.checked = settings.stripUtm !== false;
    enabledHint.textContent = enabled.checked
      ? "On. Links are cleaned when you copy or share them."
      : "Off. Automatic cleaning is paused.";

    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transition");
    });
  }

  function showResult(value, message, state, disableCopy) {
    resultWrap.hidden = false;
    result.value = value;
    result.title = value;
    copyButton.disabled = disableCopy;
    status.textContent = message;
    status.dataset.state = state;
  }

  function cleanNow() {
    const raw = input.value.trim();

    if (!raw) {
      showResult("", "Paste a link first.", "muted", true);
      input.focus();
      return;
    }

    if (!/^https?:\/\//i.test(raw)) {
      showResult(
        "",
        "Paste a full http(s) link, for example https://youtu.be/…",
        "muted",
        true
      );
      input.focus();
      return;
    }

    if (!api) {
      showResult(
        "",
        "The cleaner did not load. Reload the extension.",
        "error",
        true
      );
      return;
    }

    const cleaned = api.cleanText(raw, {
      stripUtm: settings.stripUtm !== false,
    });
    const unchanged = cleaned === raw;

    showResult(
      cleaned,
      unchanged
        ? "Already clean — nothing to remove."
        : "Cleaned. The link opens the same page without the tracking tags.",
      unchanged ? "muted" : "ok",
      false
    );

    result.setSelectionRange(0, 0);
    result.scrollLeft = 0;
    result.focus({ preventScroll: true });
  }

  async function copyResult() {
    if (!result.value) return;
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(result.value);
      copyButton.textContent = "Copied";
      status.textContent = "Copied to clipboard.";
      status.dataset.state = "ok";
      copyTimer = setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1200);
    } catch {
      result.focus();
      result.select();
      status.textContent = "Press Ctrl/Cmd+C to copy the selected link.";
      status.dataset.state = "error";
    }
  }

  enabled.addEventListener("change", () => {
    settings = { ...settings, enabled: enabled.checked };
    render();
    save();
  });

  utm.addEventListener("change", () => {
    settings = { ...settings, stripUtm: utm.checked };
    save();
    if (!resultWrap.hidden && result.value) cleanNow();
  });

  cleanButton.addEventListener("click", cleanNow);
  copyButton.addEventListener("click", copyResult);

  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      cleanNow();
    }
  });

  result.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      copyResult();
    }
  });

  load().then(render);
})();
