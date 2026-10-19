"use strict";

const fs = require("node:fs");
const path = require("node:path");

function resolveLocale(value) {
  const normalized = String(value || "en")
    .toLowerCase()
    .replaceAll("_", "-");
  if (/^zh-(?:tc|hant|tw|hk|mo)(?:-|$)/.test(normalized)) return "zh-TC";
  if (normalized === "zh" || /^zh-(?:sc|hans|cn|sg)(?:-|$)/.test(normalized))
    return "zh-SC";
  return "en";
}

const bundles = new Map();
function createTranslator(value) {
  const locale = resolveLocale(value);
  if (!bundles.has(locale)) {
    const suffix = locale === "en" ? "" : "." + locale;
    const filename = path.join(
      __dirname,
      "..",
      "l10n",
      `bundle.l10n${suffix}.json`,
    );
    bundles.set(locale, JSON.parse(fs.readFileSync(filename, "utf8")));
  }
  const bundle = bundles.get(locale);
  return (message, ...args) =>
    String(bundle[message] ?? message).replace(/\{(\d+)\}/g, (token, index) =>
      Number(index) < args.length ? String(args[Number(index)]) : token,
    );
}

// VS Code's locale IDs are mapped in code; only zh-TC / zh-SC files are loaded.
let language = "en";
try {
  const vscode = require("vscode");
  language = vscode.env.language;
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}
const localize = createTranslator(language);

module.exports = {
  t: (...args) => localize(...args),
  getLanguage: () => language,
  resolveLocale,
  createTranslator,
};
