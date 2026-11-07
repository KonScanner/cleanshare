#!/usr/bin/env node
/*
 * Consistency check for the Chrome and Firefox manifests.
 *
 * The two manifests duplicate the name, version, permissions, matches and
 * icons. This script fails the build when one copy drifts, so a release can
 * never ship a Firefox package that watches different sites than the Chrome
 * package.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}

function fail(message) {
  console.error(`manifest check failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sorted(value) {
  return [...value].sort();
}

const pkg = readJson("package.json");
const chrome = readJson("manifest.json");
const firefox = readJson("manifest.firefox.json");

assert(chrome.manifest_version === 3, "Chrome manifest must be MV3");
assert(firefox.manifest_version === 3, "Firefox manifest must be MV3");

assert(
  chrome.version === pkg.version,
  `Chrome manifest version ${chrome.version} != package.json ${pkg.version}`
);
assert(
  firefox.version === pkg.version,
  `Firefox manifest version ${firefox.version} != package.json ${pkg.version}`
);

assert(
  chrome.name === firefox.name && chrome.short_name === firefox.short_name,
  "extension names differ between manifests"
);
assert(
  chrome.description === firefox.description,
  "descriptions differ between manifests"
);

/* The Firefox manifest does not need the injection-only scripting permission. */
assert(
  sorted(firefox.permissions).join() ===
    sorted(chrome.permissions.filter((value) => value !== "scripting")).join(),
  "permissions differ between manifests (Firefox should omit scripting)"
);

const chromeHosts = sorted(chrome.host_permissions || []);
const firefoxHosts = sorted(firefox.host_permissions || []);
assert(
  chromeHosts.join() === firefoxHosts.join(),
  "host_permissions differ between manifests"
);

const chromeMatches = sorted(
  new Set(chrome.content_scripts.flatMap((entry) => entry.matches))
);
const firefoxMatches = sorted(
  new Set(firefox.content_scripts.flatMap((entry) => entry.matches))
);
assert(
  chromeMatches.join() === firefoxMatches.join(),
  "content-script matches differ between manifests"
);

for (const [label, manifest] of [
  ["Chrome", chrome],
  ["Firefox", firefox],
]) {
  for (const size of ["16", "32", "48", "128"]) {
    assert(
      manifest.icons[size] && existsSync(join(root, manifest.icons[size])),
      `${label} icon ${size} is missing`
    );
  }
}

/* Chrome: one isolated bridge, injection at runtime through the worker. */
assert(
  chrome.background && typeof chrome.background.service_worker === "string",
  "Chrome manifest must declare background.service_worker"
);
assert(
  !chrome.background.scripts,
  "Chrome manifest must not declare background.scripts"
);
assert(
  chrome.content_scripts.length === 1 &&
    chrome.content_scripts[0].js.join() === "src/bridge.js",
  "Chrome manifest must have exactly the isolated bridge content script"
);
assert(
  !JSON.stringify(chrome.content_scripts).includes('"world"'),
  "Chrome manifest must not declare a MAIN world (Chrome 95 would ignore it)"
);

/* Firefox: the manifest owns the MAIN-world injection. */
const settings = firefox.browser_specific_settings || {};
const gecko = settings.gecko || {};
assert(gecko.id, "Firefox manifest must declare a gecko id");
assert(
  gecko.strict_min_version === "140.0",
  "Firefox manifest must require Firefox 140 (data collection declaration)"
);
assert(
  settings.gecko_android &&
    settings.gecko_android.strict_min_version === "142.0",
  "Firefox Android must require 142 (data collection declaration support)"
);
assert(
  gecko.data_collection_permissions &&
    sorted(gecko.data_collection_permissions.required).join() === "none",
  'Firefox manifest must declare data_collection_permissions ["none"]'
);
assert(
  firefox.background && Array.isArray(firefox.background.scripts),
  "Firefox manifest must declare background.scripts (Firefox has no MV3 workers)"
);
assert(
  !firefox.background.service_worker,
  "Firefox manifest must not declare background.service_worker"
);

const firefoxMain = firefox.content_scripts.find((entry) => entry.world === "MAIN");
assert(firefoxMain, "Firefox manifest must declare a MAIN-world content script");
assert(
  firefoxMain.run_at === "document_start",
  "Firefox MAIN-world content script must run at document_start"
);
assert(
  firefoxMain.js.join() === "src/cleaner.js,src/main.js",
  "Firefox MAIN-world content script must load the cleaner before the patcher"
);
assert(
  firefox.content_scripts.some(
    (entry) => !entry.world && entry.js.join() === "src/bridge.js"
  ),
  "Firefox manifest must keep the isolated settings bridge"
);

console.log("manifest check: OK");
