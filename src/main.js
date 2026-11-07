/*
 * Runs in the page's MAIN world on YouTube, X, Facebook and Instagram.
 *
 * The share buttons on these sites do not use a normal <a download> or a
 * form. They read the URL from page state and hand it to one of the browser
 * APIs below. Wrapping those APIs is the least invasive way to make sure the
 * tracking tail never reaches the clipboard or the native share sheet.
 */
(function () {
  "use strict";

  const api = globalThis.__shareClean;
  if (!api || globalThis.__cleanShareInstalled) return;
  globalThis.__cleanShareInstalled = true;
  globalThis.__cleanShareInjectedAt = document.readyState;

  const FALLBACK_SETTINGS = { ...api.DEFAULT_SETTINGS };
  let liveSettings = { ...FALLBACK_SETTINGS };

  function readSettings() {
    const root = document.documentElement;
    const raw = root && root.getAttribute("data-cleanshare");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return { ...FALLBACK_SETTINGS, ...parsed };
        }
      } catch {
        // Fall through to the last settings delivered by the bridge.
      }
    }
    return liveSettings;
  }

  document.addEventListener("cleanshare:settings", (event) => {
    try {
      const parsed = JSON.parse(event.detail);
      if (parsed && typeof parsed === "object") {
        liveSettings = { ...FALLBACK_SETTINGS, ...parsed };
      }
    } catch {
      // The data attribute remains the source of truth.
    }
  });

  function clean(value) {
    const settings = readSettings();
    if (!settings.enabled) return value;
    return api.cleanText(value, { stripUtm: settings.stripUtm !== false });
  }

  function cleanUrlValue(value) {
    const settings = readSettings();
    if (!settings.enabled) return value;
    return api.cleanUrl(value, { stripUtm: settings.stripUtm !== false });
  }

  function cleanHtml(html) {
    if (
      typeof html !== "string" ||
      !/https?:\/\//i.test(html) ||
      typeof DOMParser !== "function"
    ) {
      return html;
    }

    try {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      let changed = false;
      for (const link of parsed.querySelectorAll("[href]")) {
        const href = link.getAttribute("href");
        if (!href) continue;
        const cleaned = cleanUrlValue(href);
        if (cleaned !== href) {
          link.setAttribute("href", cleaned);
          changed = true;
        }
      }
      return changed ? parsed.body.innerHTML : html;
    } catch {
      return html;
    }
  }

  function cleanUriList(text) {
    if (typeof text !== "string" || !/https?:\/\//i.test(text)) return text;
    return text
      .split(/\r?\n/)
      .map((line) => {
        const value = line.trim();
        return value && !value.startsWith("#") ? cleanUrlValue(line) : line;
      })
      .join("\n");
  }

  function replaceMethod(target, name, value) {
    if (!target) return false;
    try {
      Object.defineProperty(target, name, {
        configurable: true,
        writable: true,
        value,
      });
      return true;
    } catch {
      try {
        target[name] = value;
        return target[name] === value;
      } catch {
        return false;
      }
    }
  }

  /*
   * navigator.clipboard.writeText is what X, YouTube and Facebook use for
   * their "Copy link" buttons.
   */
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    const nativeWriteText = clipboard.writeText.bind(clipboard);
    replaceMethod(clipboard, "writeText", function writeText(text) {
      const next = typeof text === "string" ? clean(text) : text;
      return nativeWriteText(next);
    });
  }

  /*
   * Some share widgets construct a ClipboardItem instead. Clean text, HTML
   * and URI-list data while preserving every other format the item carries.
   */
  if (
    clipboard &&
    typeof clipboard.write === "function" &&
    typeof ClipboardItem === "function"
  ) {
    const nativeWrite = clipboard.write.bind(clipboard);
    replaceMethod(clipboard, "write", async function write(items) {
      try {
        const rewritten = [];
        for (const item of items) {
          if (!(item instanceof ClipboardItem)) {
            rewritten.push(item);
            continue;
          }

          const data = {};
          let changed = false;
          for (const type of item.types) {
            const blob = await item.getType(type);
            if (
              type === "text/plain" ||
              type === "text/html" ||
              type === "text/uri-list"
            ) {
              const text = await blob.text();
              const cleaned =
                type === "text/plain"
                  ? clean(text)
                  : type === "text/html"
                    ? cleanHtml(text)
                    : cleanUriList(text);
              data[type] = cleaned === text ? blob : new Blob([cleaned], { type });
              changed = changed || cleaned !== text;
            } else {
              data[type] = blob;
            }
          }
          rewritten.push(changed ? new ClipboardItem(data) : item);
        }
        return await nativeWrite(rewritten);
      } catch {
        // Never make copying fail because the cleaner could not read an item.
        return nativeWrite(items);
      }
    });
  }

  /*
   * The Web Share API is used by the native share sheet on platforms that
   * support it. Patch both url and text because some widgets put the link in
   * text only.
   */
  if (typeof navigator.share === "function") {
    const nativeShare = navigator.share.bind(navigator);
    replaceMethod(navigator, "share", function share(data) {
      if (data && typeof data === "object") {
        const next = { ...data };
        if (typeof next.url === "string") next.url = clean(next.url);
        if (typeof next.text === "string") next.text = clean(next.text);
        data = next;
      }
      return nativeShare(data);
    });
  }

  /*
   * Ctrl/Cmd+C and widgets that call document.execCommand("copy") fire a
   * copy event instead of using the async clipboard API.
   */
  function selectedText() {
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      return selection.toString();
    }

    const element = document.activeElement;
    if (
      element &&
      (element.tagName === "INPUT" || element.tagName === "TEXTAREA")
    ) {
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? 0;
      if (end > start) return element.value.slice(start, end);
    }

    return "";
  }

  function selectedHtml() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return "";
    }

    const container = document.createElement("div");
    for (let index = 0; index < selection.rangeCount; index += 1) {
      container.appendChild(selection.getRangeAt(index).cloneContents());
    }
    return container.innerHTML;
  }

  document.addEventListener(
    "copy",
    (event) => {
      if (!event.clipboardData) return;

      const text = selectedText();
      let html = "";
      let uriList = "";
      try {
        html = event.clipboardData.getData("text/html") || selectedHtml();
        uriList = event.clipboardData.getData("text/uri-list") || "";
      } catch {
        return;
      }

      if (!text && !html && !uriList) return;

      const plain = text ? clean(text) : "";
      const cleanedHtml = html ? cleanHtml(html) : "";
      const cleanedUriList = uriList ? cleanUriList(uriList) : "";
      const plainChanged = Boolean(text) && plain !== text;
      const htmlChanged = Boolean(html) && cleanedHtml !== html;
      const uriChanged = Boolean(uriList) && cleanedUriList !== uriList;

      if (!plainChanged && !htmlChanged && !uriChanged) return;

      event.clipboardData.setData("text/plain", plain || text || "");
      if (html) event.clipboardData.setData("text/html", cleanedHtml);
      if (uriList) event.clipboardData.setData("text/uri-list", cleanedUriList);
      event.preventDefault();
    },
    true
  );
})();
