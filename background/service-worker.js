/*
 * Injects the page-world patcher into supported tabs.
 *
 * The isolated-world bridge asks this service worker to inject the page-world
 * patcher with chrome.scripting. Its `world: "MAIN"` option has been available
 * since Chrome 95, so this one path works on Chrome 95 and newer.
 */
"use strict";

const SCRIPT_ID = "cleanshare-page-world";
const MATCHES = [
  "*://*.youtube.com/*",
  "*://*.youtu.be/*",
  "*://*.x.com/*",
  "*://*.twitter.com/*",
  "*://*.facebook.com/*",
  "*://*.instagram.com/*",
];

function chromeMajor() {
  const match = /Chrome\/(\d+)/.exec(navigator.userAgent || "");
  return match ? Number(match[1]) : 0;
}

/*
 * Chrome 102+ can register a MAIN-world content script at document_start.
 * This gives the best timing. On Chrome 95-101, only the message fallback
 * below is available, so injection happens after the page loads.
 */
async function ensureRegistered() {
  if (
    chromeMajor() < 102 ||
    !chrome.scripting ||
    typeof chrome.scripting.registerContentScripts !== "function"
  ) {
    return;
  }

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [SCRIPT_ID],
    });
    if (existing.length > 0) return;

    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: MATCHES,
        js: ["src/cleaner.js", "src/main.js"],
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true,
      },
    ]);
  } catch {
    // The message fallback below still injects into the current tab.
  }
}

ensureRegistered();
chrome.runtime.onInstalled.addListener(ensureRegistered);
chrome.runtime.onStartup.addListener(ensureRegistered);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !message ||
    message.type !== "cleanshare:inject" ||
    !sender.tab ||
    sender.tab.id == null
  ) {
    return undefined;
  }

  try {
    const injection = {
      target: { tabId: sender.tab.id },
      files: ["src/cleaner.js", "src/main.js"],
      world: "MAIN",
    };
    if (chromeMajor() >= 102) {
      injection.injectImmediately = true;
    }

    chrome.scripting.executeScript(
      injection,
      () => {
        const error = chrome.runtime.lastError;
        sendResponse({ ok: !error, error: error ? error.message : undefined });
      }
    );
  } catch (error) {
    sendResponse({ ok: false, error: String(error) });
    return false;
  }

  return true;
});
