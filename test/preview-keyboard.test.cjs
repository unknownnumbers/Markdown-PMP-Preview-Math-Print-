"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const MarkdownIt = require("markdown-it");
const { installPreview } = require("../src/preview.cjs");
const script = fs.readFileSync(
  require.resolve("../assets/preview-keyboard.js"),
  "utf8",
);

function keyboard() {
  const marker = { dataset: { pmpSuppressAltMenus: "false" } };
  const document = { body: { dataset: {} }, querySelector: () => marker };
  const window = new EventTarget();
  const add = window.addEventListener.bind(window);
  let listeners = 0;
  window.addEventListener = (...args) => {
    listeners++;
    add(...args);
  };
  const context = vm.createContext({ window, document });
  const run = () => vm.runInContext(script, context);
  run();
  return {
    marker,
    document,
    run,
    get listeners() {
      return listeners;
    },
    press(key = "s", modifiers = {}) {
      const event = new Event("keydown");
      Object.assign(event, {
        key,
        code: "Key" + key.toUpperCase(),
        keyCode: key.toUpperCase().charCodeAt(0),
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        isComposing: false,
        ...modifiers,
      });
      window.dispatchEvent(event);
      return event;
    },
  };
}

test("Native preview edits reuse one keyboard listener and read the current switch", () => {
  const preview = keyboard();
  assert.equal(preview.press().key, "s");
  for (let i = 0; i < 20; i++) preview.run();
  assert.equal(preview.listeners, 1);
  preview.marker.dataset.pmpSuppressAltMenus = "true";
  const event = preview.press();
  assert.equal(event.key, "Unidentified");
  assert.equal(event.code, "KeyS");
  assert.equal(event.keyCode, 83);
  assert.equal(event.altKey, true);
  preview.marker.dataset.pmpSuppressAltMenus = "false";
  assert.equal(preview.press().key, "s");
});

test("Only plain Alt+E and Alt+S hide the competing menu character", () => {
  const preview = keyboard();
  preview.document.body.dataset.pmpSuppressAltMenus = "true";
  for (const key of ["e", "s"]) {
    assert.equal(preview.press(key).key, "Unidentified");
    assert.equal(preview.press(key, { ctrlKey: true }).key, key);
    assert.equal(preview.press(key, { shiftKey: true }).key, key);
    assert.equal(preview.press(key, { altKey: false }).key, key);
  }
  for (const key of ["b", "v", "r", "f"])
    assert.equal(preview.press(key).key, key);
});

test("Long and native previews use independent switches", () => {
  const preview = keyboard();
  preview.marker.dataset.pmpSuppressAltMenus = "true";
  preview.document.body.dataset.pmpSuppressAltMenus = "false";
  assert.equal(preview.press().key, "s");
  preview.marker.dataset.pmpSuppressAltMenus = "false";
  preview.document.body.dataset.pmpSuppressAltMenus = "true";
  assert.equal(preview.press().key, "Unidentified");
});

test("Default native preview refreshes keyboard metadata from cached tokens without theme styles", () => {
  const md = new MarkdownIt();
  let enabled = true;
  installPreview(
    md,
    () => ({ theme: "default" }),
    () => ({ enabled: false }),
    () => {
      throw new Error("Default must not create theme styles");
    },
    undefined,
    undefined,
    () => enabled,
  );
  const env = {},
    tokens = md.parse("A paragraph.", env);
  for (const value of [true, false, true]) {
    enabled = value;
    const html = md.renderer.render(tokens, md.options, env);
    assert.match(html, new RegExp(`data-pmp-suppress-alt-menus="${value}"`));
    assert.equal((html.match(/pmp-preview-keyboard/g) || []).length, 1);
    assert.doesNotMatch(html, /<style|inkpage-theme-marker/);
    assert.match(html, /<p>A paragraph\.<\/p>/);
  }
});
