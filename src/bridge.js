/*
 * Isolated-world bridge. Reads the user's settings from chrome.storage and
 * publishes them to the page two ways:
 *   1. a data attribute read by src/main.js on every copy/share, and
 *   2. a CustomEvent for immediate updates.
 *
 * The attribute is the source of truth because MAIN-world scripts cannot use
 * chrome.* APIs.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "settings";
  const DEFAULTS = { enabled: true, stripUtm: true };

  function publish(settings) {
    const value = { ...DEFAULTS, ...(settings || {}) };
    const serialized = JSON.stringify(value);

    const applyAttribute = () => {
      if (document.documentElement) {
        document.documentElement.setAttribute("data-cleanshare", serialized);
      }
    };

    applyAttribute();
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", applyAttribute, { once: true });
    }

    document.dispatchEvent(
      new CustomEvent("cleanshare:settings", { detail: serialized })
    );
  }

  function load() {
    try {
      chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULTS }, (result) => {
        if (chrome.runtime?.lastError) {
          publish(DEFAULTS);
          return;
        }
        publish(result && result[STORAGE_KEY]);
      });
    } catch {
      publish(DEFAULTS);
    }
  }

  load();

  /*
   * The clipboard and share wrappers must run in the page's MAIN world. Ask
   * the service worker to inject them with chrome.scripting, whose `world`
   * option works from Chrome 95. (Declaring "world": "MAIN" in manifest.json
   * would require Chrome 111, so this path is used for every version.)
   */
  let injectAttempts = 0;
  function requestMainWorld() {
    try {
      chrome.runtime.sendMessage({ type: "cleanshare:inject" }, (response) => {
        const failed = chrome.runtime.lastError || !response || !response.ok;
        if (failed && injectAttempts < 2) {
          injectAttempts += 1;
          setTimeout(requestMainWorld, 250);
        }
      });
    } catch {
      // The extension context can be invalidated while a page stays open.
    }
  }
  requestMainWorld();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[STORAGE_KEY]) {
        publish(changes[STORAGE_KEY].newValue);
      }
    });
  } catch {
    // Storage is unavailable in some preview contexts; defaults still work.
  }
})();
