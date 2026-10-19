import fs from "node:fs/promises";
import path from "node:path";
import { manifest, writeCatalogs } from "./localization-catalog.mjs";
const root = path.resolve(import.meta.dirname, "..");
const filename = path.join(root, "package.json");
const pkg = JSON.parse(await fs.readFile(filename, "utf8"));
const keys = new Set(manifest.map((row) => row[0]));
const ref = (key) => {
  if (!keys.has(key)) throw new Error(`Missing manifest translation: ${key}`);
  return `%${key}%`;
};
pkg.version = "1.0.0";
pkg.name = "preview-math-print";
pkg.publisher = "markdown-pmp";
pkg.displayName = ref("extension.displayName");
pkg.description = ref("extension.description");
delete pkg.l10n;
pkg.keywords = [
  "markdown",
  "preview",
  "math",
  "pdf",
  "offline",
  "fonts",
  "themes",
];
pkg.capabilities.untrustedWorkspaces.description = ref("capability.untrusted");
pkg.capabilities.virtualWorkspaces.description = ref("capability.virtual");
for (const command of pkg.contributes.commands) {
  command.title = ref("command." + command.command.split(".")[1]);
  command.category = ref("extension.category");
}
pkg.contributes.submenus[0].label = ref("menu.export");
pkg.contributes.configuration.title = ref("extension.category");
pkg.contributes.configuration.properties = Object.fromEntries(
  Object.entries(pkg.contributes.configuration.properties).map(
    ([key, setting]) => [key.replace(/^inkpage\./, "Markdown-PMP."), setting],
  ),
);
for (const [key, setting] of Object.entries(
  pkg.contributes.configuration.properties,
))
  setting.description = ref("setting." + key.replace(/^Markdown-PMP\./, ""));
const theme = pkg.contributes.configuration.properties["Markdown-PMP.theme"];
theme.enumDescriptions = ["default", "purple", "blue", "redblue"].map((key) =>
  ref("theme." + key),
);
pkg.contributes.configuration.properties[
  "Markdown-PMP.pdf.browserPath"
].deprecationMessage = ref("setting.pdf.browserPath.deprecated");
pkg.scripts.package =
  'pnpm run build && vsce package --no-dependencies --allow-missing-repository --out "../output/Markdown PMP (Preview-Math-Print)-1.0.0.vsix"';
pkg.scripts["build:l10n"] = "node scripts/localization-catalog.mjs";
await fs.writeFile(filename, JSON.stringify(pkg, null, 2) + "\n");
await writeCatalogs();
console.log(
  "Prepared English, Traditional Chinese and Simplified Chinese localization.",
);
