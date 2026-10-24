"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { setImmediate } = require("node:timers/promises");
const script = fs.readFileSync(
  path.join(__dirname, "../assets/preview-fonts.js"),
  "utf8",
);

function fontPreview(large) {
  const applied = [],
    requested = [],
    pending = [],
    errors = [];
  let observerCount = 0;
  let notify,
    disconnected = false;
  const document = {
    readyState: "complete",
    body: {},
    querySelector: () => (large ? {} : null),
    documentElement: { classList: { add: (value) => applied.push(value) } },
    fonts: ["Inkpage Roman", "Inkpage WenKai", "InkpageKaTeX_Main"].map(
      (family) => ({
        family,
        load() {
          requested.push(family);
          return new Promise((resolve, reject) =>
            pending.push({ resolve, reject }),
          );
        },
      }),
    ),
  };
  const context = vm.createContext({
    document,
    console: { error: (...args) => errors.push(args) },
    MutationObserver: class {
      constructor(callback) {
        observerCount++;
        notify = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  vm.runInContext(script, context);
  return {
    applied,
    requested,
    pending,
    errors,
    repeatScript() {
      vm.runInContext(script, context);
    },
    get observerCount() {
      return observerCount;
    },
    becomeLarge() {
      large = true;
      notify();
    },
    get disconnected() {
      return disconnected;
    },
  };
}

test("Large previews apply bundled body fonts together after every face is ready", async () => {
  const preview = fontPreview(true);
  assert.deepEqual(preview.requested, ["Inkpage Roman", "Inkpage WenKai"]);
  preview.pending[0].resolve();
  await setImmediate();
  assert.deepEqual(preview.applied, []);
  preview.pending[1].resolve();
  await setImmediate();
  assert.deepEqual(preview.applied, ["pmp-fonts-ready"]);
});

test("Default and short documents avoid preloading; switching to a large document starts the batch", async () => {
  const preview = fontPreview(false);
  assert.deepEqual(preview.requested, []);
  preview.becomeLarge();
  assert.equal(preview.disconnected, true);
  preview.pending.forEach((face) => face.resolve());
  await setImmediate();
  assert.deepEqual(preview.applied, ["pmp-fonts-ready"]);
});

test("A failed font leaves a readable fallback and reports the actual error", async () => {
  const preview = fontPreview(true);
  preview.pending[0].resolve();
  preview.pending[1].reject(new Error("Font unavailable"));
  await setImmediate();
  assert.deepEqual(preview.applied, []);
  assert.equal(preview.errors.length, 1);
});

test("Editing the native preview does not accumulate font observers or loading batches", () => {
  const preview = fontPreview(false);
  for (let i = 0; i < 20; i++) preview.repeatScript();
  assert.equal(preview.observerCount, 1);
  preview.becomeLarge();
  preview.repeatScript();
  assert.deepEqual(preview.requested, ["Inkpage Roman", "Inkpage WenKai"]);
});
