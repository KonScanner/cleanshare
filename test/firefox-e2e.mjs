/*
 * End-to-end check for the Firefox build.
 *
 * It builds a temporary copy of the Firefox extension, adds a small spy that
 * runs before the page-world patcher, loads it into Firefox through
 * geckodriver, serves a fake x.com page, and verifies that:
 *
 *   - the MAIN-world script runs before the page's own scripts,
 *   - the cleaner and the settings bridge are present,
 *   - navigator.clipboard.writeText passes a cleaned URL to the native API,
 *   - a YouTube timestamp survives while `si` is removed.
 *
 * Requirements: Firefox 140+, geckodriver, zip, Node 22+.
 *
 * Run with:
 *   GECKODRIVER=/path/to/geckodriver npm run test:e2e:firefox
 *
 * Set FIREFOX_BIN to choose a Firefox binary. If geckodriver or Firefox is
 * missing, the test prints SKIP and exits 0 so it can live in a shared repo.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const REPO = resolve(import.meta.dirname, "..");
const DRIVER = process.env.GECKODRIVER || "geckodriver";
const FIREFOX =
  process.env.FIREFOX_BIN ||
  [
    "/snap/firefox/current/usr/lib/firefox/firefox",
    "/usr/lib/firefox/firefox",
    "/usr/bin/firefox",
  ].find((path) => existsSync(path));

function log(...args) {
  console.log("[firefox-e2e]", ...args);
}

function skip(reason) {
  console.log(`[firefox-e2e] SKIP: ${reason}`);
  process.exit(0);
}

if (!FIREFOX) skip("Firefox was not found. Set FIREFOX_BIN.");

try {
  execFileSync(DRIVER, ["--version"], { stdio: "ignore" });
} catch {
  skip("geckodriver was not found. Set GECKODRIVER.");
}

try {
  execFileSync("zip", ["-v"], { stdio: "ignore" });
} catch {
  skip("zip was not found.");
}

const work = mkdtempSync(join(tmpdir(), "cleanshare-firefox-e2e-"));
const extensionDir = join(work, "extension");
const home = join(work, "home");
const xpi = join(work, "cleanshare.xpi");

function copyRuntime() {
  mkdirSync(join(extensionDir, "icons"), { recursive: true });
  cpSync(join(REPO, "src"), join(extensionDir, "src"), { recursive: true });
  cpSync(join(REPO, "background"), join(extensionDir, "background"), {
    recursive: true,
  });
  cpSync(join(REPO, "popup"), join(extensionDir, "popup"), { recursive: true });
  cpSync(join(REPO, "icons"), join(extensionDir, "icons"), {
    recursive: true,
  });

  const manifest = JSON.parse(
    readFileSync(join(REPO, "manifest.firefox.json"), "utf8")
  );

  /*
   * Put the spy in the same MAIN-world content script, before the cleaner and
   * the patcher. It replaces writeText with a recorder, so no clipboard
   * permission or user gesture is needed and the test can see the exact value
   * that the patcher would have written.
   */
  const mainEntry = manifest.content_scripts.find(
    (entry) => entry.world === "MAIN"
  );
  mainEntry.js.unshift("test/spy.js");

  writeFileSync(
    join(extensionDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  mkdirSync(join(extensionDir, "test"), { recursive: true });
  writeFileSync(
    join(extensionDir, "test", "spy.js"),
    `(function () {
      "use strict";
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== "function") return;
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        writable: true,
        value: function writeText(text) {
          const writes = (globalThis.__cleanshareWrites ||= []);
          writes.push(text);
          return Promise.resolve();
        },
      });
    })();
`
  );
  execFileSync(
    "zip",
    [
      "-q",
      "-r",
      xpi,
      "manifest.json",
      "background",
      "src",
      "popup",
      "icons",
      "test",
    ],
    { cwd: extensionDir }
  );
}

function makeProfile() {
  mkdirSync(home, { recursive: true });
  mkdirSync(join(home, "tmp"), { recursive: true });
  mkdirSync(join(home, ".cache"), { recursive: true });
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>x.com test</title>
<script>
  window.__cleanShareAtParse = {
    installed: window.__cleanShareInstalled === true,
    injectedAt: window.__cleanShareInjectedAt || null,
    wrapped: /clean\\(/.test(String(navigator.clipboard && navigator.clipboard.writeText)),
  };
</script>
</head>
<body>
  <p>Firefox end-to-end test page.</p>
  <script>
    (async function () {
      const result = (window.__result = {
        atParse: window.__cleanShareAtParse,
        settings: null,
        writeText: null,
        copy: null,
        timestamp: null,
        done: false,
      });

      try {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const value = document.documentElement.getAttribute("data-cleanshare");
          if (value) {
            result.settings = value;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const api = window.__shareClean;
        result.timestamp = api
          ? api.cleanUrl("https://youtu.be/dQw4w9WgXcQ?si=hK3nR9pQ&t=12312")
          : null;

        await navigator.clipboard.writeText(
          "https://x.com/user/status/123?a=Kq3vX9mPzR2tLw8nYb4c&s=19"
        );
        result.writeText = (window.__cleanshareWrites || []).slice();

        /*
         * Select a URL as plain text, then dispatch a synthetic copy event.
         * This is the Ctrl/Cmd+C path: the patcher reads the selection, cleans
         * it, writes the clean value back to the event and prevents the default.
         */
        const holder = document.createElement("div");
        holder.textContent =
          "https://youtu.be/dQw4w9WgXcQ?si=hK3nR9pQ&t=12312";
        document.body.appendChild(holder);
        const range = document.createRange();
        range.selectNodeContents(holder);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        const data = new DataTransfer();
        data.setData("text/plain", holder.textContent);
        const event = new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        result.copy = {
          hasData: Boolean(event.clipboardData),
          selected: selection.toString(),
          prevented: event.defaultPrevented,
          text: event.clipboardData
            ? event.clipboardData.getData("text/plain")
            : data.getData("text/plain"),
        };
      } catch (error) {
        result.error = String(error && error.stack ? error.stack : error);
      } finally {
        result.done = true;
      }
    })();
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(PAGE);
});
await new Promise((resolvePromise) =>
  server.listen(0, "127.0.0.1", resolvePromise)
);
const serverPort = server.address().port;

async function freePort() {
  const probe = createServer();
  await new Promise((resolvePromise) =>
    probe.listen(0, "127.0.0.1", resolvePromise)
  );
  const value = probe.address().port;
  await new Promise((resolvePromise) => probe.close(resolvePromise));
  return value;
}

copyRuntime();
makeProfile();

const driverPort = await freePort();
const driver = spawn(
  DRIVER,
  ["--port", String(driverPort), "--log", "error"],
  {
    env: {
      ...process.env,
      HOME: home,
      TMPDIR: join(home, "tmp"),
      XDG_CACHE_HOME: join(home, ".cache"),
      GSETTINGS_BACKEND: "memory",
    },
    stdio: ["ignore", "ignore", "pipe"],
  }
);
let driverLog = "";
let driverError = "";
driver.on("error", (error) => {
  driverError = String(error);
});
driver.stderr.on("data", (chunk) => {
  driverLog += chunk.toString();
});

const base = `http://127.0.0.1:${driverPort}`;
let sessionId = null;

async function wd(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) {
    throw new Error(
      `${method} ${path} failed: ${JSON.stringify(json.value || json)}`
    );
  }
  return json.value;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  }
  return last;
}

let failed = false;
try {
  const ready = await waitFor(async () => {
    try {
      const status = await wd("GET", "/status");
      return status && status.ready ? true : null;
    } catch {
      return null;
    }
  }, 15000);
  if (!ready) {
    throw new Error(
      `geckodriver did not start:\n${driverError || driverLog}`
    );
  }

  const session = await wd("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "firefox",
        acceptInsecureCerts: true,
        "moz:firefoxOptions": {
          binary: FIREFOX,
          args: ["-headless"],
          prefs: {
            "network.proxy.type": 0,
            "network.dns.localDomains": "x.com",
            "dom.securecontext.allowlist": "x.com",
            "dom.events.testing.asyncClipboard": true,
            "browser.shell.checkDefaultBrowser": false,
            "datareporting.policy.dataSubmissionEnabled": false,
          },
        },
      },
    },
  });
  sessionId = session.sessionId;
  log("Firefox", session.capabilities.browserVersion);

  await wd("POST", `/session/${sessionId}/moz/addon/install`, {
    path: xpi,
    temporary: true,
  });
  log("installed", basename(xpi));

  await wd("POST", `/session/${sessionId}/url`, {
    url: `http://x.com:${serverPort}/`,
  });

  const result = await waitFor(async () => {
    const value = await wd("POST", `/session/${sessionId}/execute/sync`, {
      script: "return window.__result || null;",
      args: [],
    });
    return value && value.done ? value : null;
  }, 15000);

  if (!result) {
    throw new Error("the test page did not finish");
  }
  log(JSON.stringify(result, null, 2));
  if (result.error) throw new Error(result.error);

  const checks = [
    ["MAIN-world script ran before page scripts", result.atParse.installed],
    [
      "script was injected at document_start",
      result.atParse.injectedAt === "loading",
    ],
    ["clipboard API was wrapped before page scripts", result.atParse.wrapped],
    [
      "settings bridge published defaults",
      result.settings === '{"enabled":true,"stripUtm":true}',
    ],
    [
      "YouTube timestamp was kept",
      result.timestamp === "https://youtu.be/dQw4w9WgXcQ?t=12312",
    ],
    [
      "writeText received a cleaned X URL",
      result.writeText.length === 1 &&
        result.writeText[0] === "https://x.com/user/status/123",
    ],
    [
      "copy event cleaned the selected URL",
      result.copy.hasData &&
        result.copy.prevented &&
        result.copy.text === "https://youtu.be/dQw4w9WgXcQ?t=12312",
    ],
  ];

  for (const [label, ok] of checks) {
    log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) failed = true;
  }
} catch (error) {
  failed = true;
  console.error("[firefox-e2e] ERROR", error);
  if (driverError.trim()) console.error(driverError);
  if (driverLog.trim()) console.error(driverLog);
} finally {
  if (sessionId) {
    await wd("DELETE", `/session/${sessionId}`).catch(() => {});
  }
  driver.kill();
  server.close();
  rmSync(work, { recursive: true, force: true });
}

if (failed) {
  console.error("[firefox-e2e] FAIL");
  process.exit(1);
}
log("PASS");
