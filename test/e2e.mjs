/*
 * End-to-end check for the extension: loads the unpacked extension in Chrome,
 * serves a fake x.com page over HTTPS, and verifies the clipboard/share
 * wrappers with instrumented browser APIs.
 *
 * Run with: node test/e2e.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:https";
import { setTimeout as sleep } from "node:timers/promises";

const EXTENSION = resolve(import.meta.dirname, "..");
const CHROME = process.env.CHROME_BIN || "google-chrome";

const work = mkdtempSync(join(tmpdir(), "cleanshare-e2e-"));
const profile = join(work, "profile");
const cert = join(work, "cert.pem");
const key = join(work, "key.pem");

function log(...args) {
  console.log("[e2e]", ...args);
}

function extensionId() {
  const digest = createHash("sha256")
    .update(EXTENSION)
    .digest("hex")
    .slice(0, 32);
  return [...digest]
    .map((digit) => String.fromCharCode(97 + parseInt(digit, 16)))
    .join("");
}

function makeCert() {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=x.com",
      "-addext",
      "subjectAltName=DNS:x.com",
    ],
    { stdio: "ignore" }
  );
}

const PAGE = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>CleanShare e2e</title></head>
  <body>
    <button id="copy">Copy link</button>
    <p id="text">Watch https://youtu.be/abc?si=track&amp;t=42 now</p>
    <p id="link"><a id="anchor" href="https://youtu.be/abc?si=track&amp;t=42">video</a></p>
    <script>
      document.getElementById("copy").addEventListener("click", () => {
        navigator.clipboard.writeText(
          "https://x.com/a/status/1?s=20&t=abc&fbclid=click"
        );
      });
    </script>
  </body>
</html>`;

function startServer() {
  return new Promise((resolveServer) => {
    const server = createServer(
      { cert: execFileSync("cat", [cert]), key: execFileSync("cat", [key]) },
      (_request, response) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(PAGE);
      }
    );
    server.listen(0, "127.0.0.1", () => {
      resolveServer({ server, port: server.address().port });
    });
  });
}

async function waitFor(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params);
        }
      }
    });
    await Promise.race([
      new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      }),
      sleep(5000).then(() => {
        throw new Error("CDP WebSocket did not open");
      }),
    ]);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
      }),
      sleep(5000).then(() => {
        throw new Error(`CDP command timed out: ${method}`);
      }),
    ]);
  }

  async eval(expression, options = {}) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      ...options,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          "evaluation failed"
      );
    }
    return result.result.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // Ignore.
    }
  }
}

async function main() {
  makeCert();
  const { server, port } = await startServer();
  const pageUrl = `https://x.com:${port}/test`;

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-proxy-server",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP x.com 127.0.0.1",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--window-size=900,700",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  let chromeLog = "";
  chrome.stderr.on("data", (data) => (chromeLog += data.toString()));

  try {
    const portFile = join(profile, "DevToolsActivePort");
    let debugPort = 0;
    for (let i = 0; i < 150; i++) {
      try {
        debugPort = Number(readFileSync(portFile, "utf8").split("\n")[0]);
        if (debugPort) break;
      } catch {
        // Chrome has not written the port yet.
      }
      await sleep(100);
    }
    if (!debugPort) throw new Error("Chrome did not expose a DevTools port");
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    const targetResponse = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?about:blank`,
      { method: "PUT" }
    );
    const target = await targetResponse.json();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    /*
     * Install instrumentation before the content script runs. writeText is
     * replaced on Clipboard.prototype, so the wrapper installed by main.js
     * still calls our recorder. The copy event recorder runs in the bubble
     * phase, after main.js has rewritten clipboardData.
     */
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          window.__writes = [];
          window.__shared = null;
          window.__copy = null;
          window.__htmlCopy = null;

          try {
            if (typeof Clipboard === "function" && Clipboard.prototype.writeText) {
              Clipboard.prototype.writeText = function (text) {
                window.__writes.push(String(text));
                return Promise.resolve();
              };
            }
          } catch {}

          try {
            if (typeof ClipboardItem === "function" && typeof Clipboard !== "undefined" && Clipboard.prototype.write) {
              Clipboard.prototype.write = async function (items) {
                const parts = [];
                for (const item of items) {
                  if (item.types.includes("text/plain")) {
                    parts.push(
                      "plain:" + (await (await item.getType("text/plain")).text())
                    );
                  }
                  if (item.types.includes("text/html")) {
                    parts.push(
                      "html:" + (await (await item.getType("text/html")).text())
                    );
                  }
                }
                window.__writes.push(parts.join("|"));
              };
            }
          } catch {}

          try {
            Object.defineProperty(navigator, "share", {
              configurable: true,
              writable: true,
              value(data) {
                window.__shared = data;
                return Promise.resolve();
              },
            });
          } catch {}

          document.addEventListener("copy", (event) => {
            window.__copy = event.clipboardData
              ? event.clipboardData.getData("text/plain")
              : null;
          });
        })();
      `,
    });

    await cdp.send("Page.navigate", { url: pageUrl });

    let installed = false;
    for (let i = 0; i < 50; i++) {
      installed = await cdp
        .eval("Boolean(window.__cleanShareInstalled)")
        .catch(() => false);
      if (installed) break;
      await sleep(100);
    }
    log("content script installed:", installed);
    if (!installed) {
      throw new Error(
        "The extension content script did not run. Chrome log:\n" +
          chromeLog.slice(-4000)
      );
    }

    const injectedAt = await cdp.eval("window.__cleanShareInjectedAt");
    log("injected at document state:", injectedAt);
    if (injectedAt !== "loading") {
      throw new Error(`expected injection while loading, got ${injectedAt}`);
    }

    // 1. Async clipboard write, the path used by the copy-link buttons.
    await cdp.eval(`document.getElementById("copy").click()`);
    await sleep(200);
    const writes = await cdp.eval("window.__writes");
    log("writeText calls:", JSON.stringify(writes));
    if (writes.at(-1) !== "https://x.com/a/status/1") {
      throw new Error(`writeText was not cleaned: ${JSON.stringify(writes)}`);
    }

    // 2. Copy event, the path used by Ctrl/Cmd+C.
    await cdp.eval(`
      (() => {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById("text"));
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const data = new DataTransfer();
        const event = new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        window.__copy = data.getData("text/plain");
      })();
    `);
    const copied = await cdp.eval("window.__copy");
    log("copy event:", JSON.stringify(copied));
    if (!copied || !copied.includes("https://youtu.be/abc?t=42")) {
      throw new Error(`copy event was not cleaned: ${JSON.stringify(copied)}`);
    }

    // 3. Hyperlink copies must clean the HTML representation too.
    await cdp.eval(`
      (() => {
        const anchor = document.getElementById("anchor");
        const range = document.createRange();
        range.selectNode(anchor);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const data = new DataTransfer();
        const event = new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        window.__htmlCopy = {
          text: data.getData("text/plain"),
          html: data.getData("text/html"),
        };
      })();
    `);
    const htmlCopy = await cdp.eval("window.__htmlCopy");
    log("html copy:", JSON.stringify(htmlCopy));
    if (
      !htmlCopy.html ||
      !htmlCopy.html.includes('href="https://youtu.be/abc?t=42"') ||
      htmlCopy.html.includes("si=track")
    ) {
      throw new Error(`HTML copy was not cleaned: ${JSON.stringify(htmlCopy)}`);
    }

    // 4. The setting delivered by the isolated-world bridge can disable it.
    await cdp.eval(
      `document.documentElement.setAttribute("data-cleanshare", JSON.stringify({enabled:false,stripUtm:true}))`
    );
    await cdp.eval(`document.getElementById("copy").click()`);
    await sleep(200);
    const disabledWrite = await cdp.eval("window.__writes.at(-1)");
    log("after disabled:", JSON.stringify(disabledWrite));
    if (disabledWrite !== "https://x.com/a/status/1?s=20&t=abc&fbclid=click") {
      throw new Error(`disable switch did not take effect: ${JSON.stringify(disabledWrite)}`);
    }

    // 5. The campaign-tag toggle is honoured.
    await cdp.eval(
      `document.documentElement.setAttribute("data-cleanshare", JSON.stringify({enabled:true,stripUtm:false}))`
    );
    await cdp.eval(
      `navigator.clipboard.writeText("https://youtu.be/abc?si=track&utm_source=x")`
    );
    await sleep(200);
    const utmWrite = await cdp.eval("window.__writes.at(-1)");
    log("after stripUtm off:", JSON.stringify(utmWrite));
    if (utmWrite !== "https://youtu.be/abc?utm_source=x") {
      throw new Error(`unexpected stripUtm-off result: ${JSON.stringify(utmWrite)}`);
    }

    // 6. ClipboardItem writes clean both text and HTML.
    await cdp.eval(`
      navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob(["https://x.com/a/status/2?s=20"], {
            type: "text/plain",
          }),
          "text/html": new Blob(
            ['<a href="https://x.com/a/status/2?s=20">post</a>'],
            { type: "text/html" }
          ),
        }),
      ])
    `);
    await sleep(200);
    const itemWrite = await cdp.eval("window.__writes.at(-1)");
    log("after clipboard.write:", JSON.stringify(itemWrite));
    if (
      !itemWrite.includes("plain:https://x.com/a/status/2") ||
      !itemWrite.includes('html:<a href="https://x.com/a/status/2">post</a>')
    ) {
      throw new Error(`clipboard.write was not cleaned: ${JSON.stringify(itemWrite)}`);
    }

    // 7. navigator.share is wrapped too.
    await cdp.eval(
      `navigator.share({url:"https://youtu.be/abc?si=track&t=9", text:"see https://x.com/a/status/1?s=20"})`
    );
    const shared = await cdp.eval("window.__shared");
    log("share payload:", JSON.stringify(shared));
    if (shared.url !== "https://youtu.be/abc?t=9" || shared.text !== "see https://x.com/a/status/1") {
      throw new Error(`share payload was not cleaned: ${JSON.stringify(shared)}`);
    }

    // 8. The popup loads as a real extension page and runs the paste cleaner.
    const popupUrl = `chrome-extension://${extensionId()}/popup/popup.html`;
    const popupResponse = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(popupUrl)}`,
      { method: "PUT" }
    );
    const popupTarget = await popupResponse.json();
    const popup = new CDP(popupTarget.webSocketDebuggerUrl);
    await popup.connect();
    await popup.send("Runtime.enable");
    await sleep(500);

    const popupReady = await popup.eval(
      `Boolean(document.getElementById("input") && window.__shareClean)`
    );
    log("popup loaded:", popupReady);
    if (!popupReady) throw new Error("popup did not load");

    const popupHeight = await popup.eval("document.body.scrollHeight");
    const detailsOpen = await popup.eval(
      `document.querySelector("details.reference").open`
    );
    log("popup height:", popupHeight, "details open:", detailsOpen);
    if (popupHeight > 600) throw new Error(`popup is too tall: ${popupHeight}`);
    if (detailsOpen) throw new Error("reference details should start closed");

    await popup.eval(`
      document.getElementById("input").value = "youtu.be/abc?si=track";
      document.getElementById("clean").click();
    `);
    const invalidPopup = await popup.eval(`
      ({
        status: document.getElementById("status").textContent,
        disabled: document.getElementById("copy").disabled,
      })
    `);
    log("popup invalid input:", JSON.stringify(invalidPopup));
    if (!invalidPopup.status.includes("http") || !invalidPopup.disabled) {
      throw new Error(`popup accepted a scheme-less input: ${JSON.stringify(invalidPopup)}`);
    }

    await popup.eval(`
      document.getElementById("input").value = "https://youtu.be/abc?si=track&t=9";
      document.getElementById("clean").click();
    `);
    const popupResult = await popup.eval(
      `document.getElementById("result").value`
    );
    const popupResultHeight = await popup.eval("document.body.scrollHeight");
    log("popup cleaned:", JSON.stringify(popupResult), "height:", popupResultHeight);
    if (popupResult !== "https://youtu.be/abc?t=9") {
      throw new Error(`popup cleaner returned ${JSON.stringify(popupResult)}`);
    }
    if (popupResultHeight > 600) {
      throw new Error(`popup result state is too tall: ${popupResultHeight}`);
    }

    await popup.eval(`
      const toggle = document.getElementById("enabled");
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));
    `);
    await sleep(200);
    const stored = await popup.eval(`
      new Promise((resolve) =>
        chrome.storage.sync.get({ settings: null }, (result) => resolve(result.settings))
      )
    `);
    log("popup saved settings:", JSON.stringify(stored));
    if (!stored || stored.enabled !== false) {
      throw new Error(`popup did not persist the toggle: ${JSON.stringify(stored)}`);
    }

    popup.close();
    cdp.close();
    log("PASS");
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    await sleep(200);
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[e2e] FAIL:", error);
  process.exitCode = 1;
});
