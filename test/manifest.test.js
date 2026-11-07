/*
 * Guards the two manifests against drift. The real checks live in
 * scripts/check-manifests.mjs so the build and the test suite use the same
 * rules.
 */
"use strict";

const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { dirname, resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");

test("Chrome and Firefox manifests stay in sync", () => {
  const output = execFileSync(
    process.execPath,
    [resolve(root, "scripts/check-manifests.mjs")],
    { cwd: root, encoding: "utf8" }
  );

  assert.match(output, /manifest check: OK/);
});
