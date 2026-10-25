"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), "utf8"));

test("Every contributed command and setting has English, Traditional and Simplified Chinese text", async () => {
  const pkg = await read("package.json");
  const catalogs = await Promise.all(
    ["", ".zh-TC", ".zh-SC"].map((suffix) => read(`package.nls${suffix}.json`)),
  );
  const references = [];
  const walk = (value) => {
    if (typeof value === "string" && /^%[^%]+%$/.test(value))
      references.push(value.slice(1, -1));
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  };
  walk(pkg);
  assert.ok(references.length > 40);
  for (const catalog of catalogs)
    for (const key of references)
      assert.ok(catalog[key]?.trim(), `Missing manifest translation: ${key}`);
  assert.equal(
    catalogs[0]["extension.displayName"],
    "Markdown PMP (Preview-Math-Print)",
  );
  const theme = pkg.contributes.configuration.properties["Markdown-PMP.theme"];
  assert.deepEqual(theme.enumItemLabels, [
    "Default",
    "Purple",
    "Blue-White",
    "Blue-Red",
  ]);
  assert.equal(pkg.name, "preview-math-print");
  assert.equal(pkg.publisher, "markdown-pmp");
  assert.equal(
    `${pkg.publisher}.${pkg.name}`,
    "markdown-pmp.preview-math-print",
  );
  for (const { command } of pkg.contributes.commands)
    assert.ok(command.startsWith("Markdown-PMP."));
  for (const legacy of ["zh-tw", "zh-cn"]) {
    await assert.rejects(
      fs.access(path.join(root, `package.nls.${legacy}.json`)),
    );
  }
});

test("Runtime translations preserve every argument and have complete locale coverage", async () => {
  const catalogs = await Promise.all(
    ["", ".zh-TC", ".zh-SC"].map((suffix) =>
      read(`l10n/bundle.l10n${suffix}.json`),
    ),
  );
  const args = (text) =>
    [...text.matchAll(/\{(\d+)\}/g)].map((x) => x[1]).sort();
  const keys = Object.keys(catalogs[0]).sort();
  assert.ok(keys.length > 100);
  for (const catalog of catalogs) {
    assert.deepEqual(Object.keys(catalog).sort(), keys);
    for (const key of keys) {
      assert.ok(catalog[key].trim());
      assert.deepEqual(
        args(catalog[key]),
        args(key),
        `Changed placeholders: ${key}`,
      );
    }
  }
  assert.equal(catalogs[1]["Export Settings"], "匯出設定");
  assert.equal(catalogs[2]["Export Settings"], "导出设置");
  for (const legacy of ["zh-tw", "zh-cn"]) {
    await assert.rejects(
      fs.access(path.join(root, `l10n/bundle.l10n.${legacy}.json`)),
    );
  }
  for (const value of Object.values(catalogs[0]))
    assert.doesNotMatch(value, /[\u4e00-\u9fff]/);
});

test("Custom language filenames follow the editor locale and preserve inserted braces", () => {
  const { resolveLocale, createTranslator } = require("../src/i18n.cjs");
  for (const name of ["zh-TC", "zh-Hant", "zh-tw", "zh-HK"])
    assert.equal(resolveLocale(name), "zh-TC");
  for (const name of ["zh-SC", "zh-Hans", "zh-cn", "zh-SG"])
    assert.equal(resolveLocale(name), "zh-SC");
  assert.equal(resolveLocale("fr"), "en");
  assert.equal(resolveLocale("../../private"), "en");
  assert.equal(createTranslator("zh-TC")("Export Settings"), "匯出設定");
  assert.equal(createTranslator("zh-SC")("Export Settings"), "导出设置");
  assert.equal(createTranslator("fr")("Export Settings"), "Export Settings");
  assert.equal(
    createTranslator("zh-TC")("Line {0}: {1}", 3, "\\frac{a}{b} and {0}"),
    "第 3 行: \\frac{a}{b} and {0}",
  );
});
