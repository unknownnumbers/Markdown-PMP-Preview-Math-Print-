import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "assets");
const katex = path.join(root, "node_modules/katex");
await fs.mkdir(path.join(assets, "math/fonts"), { recursive: true });
let css = await fs.readFile(path.join(katex, "dist/katex.css"), "utf8");
css = css
  .replace(/\.katex/g, ".inkpage-katex")
  .replace(/KaTeX_/g, "InkpageKaTeX_")
  .replace(/\b(katexEqnNo|mmlEqnNo)\b/g, "inkpage-$1")
  .replace(/^body\s*\{/gm, "body:has(.inkpage-math) {");
css = css.replace(/url\(([^)]+)\)/g, (whole, value) =>
  whole.replace(/InkpageKaTeX_/g, "KaTeX_"),
);
for (const file of await fs.readdir(path.join(katex, "dist/fonts")))
  await fs.copyFile(
    path.join(katex, "dist/fonts", file),
    path.join(assets, "math/fonts", file),
  );
css += `\n.inkpage-math{font-size:1em;overflow-wrap:normal;color:inherit;max-width:100%} .inkpage-math .inkpage-katex{font-size:1em} .inkpage-math .inkpage-katex-display{margin:0} body .markdown-body .inkpage-math *{box-sizing:content-box} .inkpage-math svg{max-width:none!important} .inkpage-math-display{display:block;position:relative;text-align:center;overflow-x:auto;overflow-y:hidden;margin:1em 0;padding:4px 0} .inkpage-equation-content{display:inline-block;vertical-align:middle} .inkpage-math-display:has(.inkpage-equation-number){padding-right:3.5em;padding-left:3.5em} .inkpage-equation-number{position:absolute;right:0;top:50%;transform:translateY(-50%);font:inherit} .inkpage-math-error{color:#b42332!important;white-space:pre-wrap!important} .inkpage-math-error-message{display:block;color:#b42332;font:12px/1.5 sans-serif;text-align:left} @media print{.inkpage-math-display{overflow:visible;break-inside:avoid}}\n`;
css += ".inkpage-math-fallback{white-space:pre-wrap!important;overflow-wrap:anywhere!important}\n";
await fs.writeFile(path.join(assets, "math/math.css"), css);
await fs.copyFile(
  path.join(katex, "LICENSE"),
  path.join(assets, "math/LICENSE.txt"),
);
const codeApp = process.argv[2];
if (!codeApp)
  throw new Error(
    "Pass the VS Code resources/app directory to prepare native style snapshots.",
  );
const native = path.join(
  codeApp,
  "extensions/markdown-language-features/media",
);
for (const file of ["markdown.css", "highlight.css"])
  await fs.copyFile(
    path.join(native, file),
    path.join(assets, `native-${file}`),
  );
const theme = (
  await fs.readFile(path.join(assets, "theme.css"), "utf8")
).replace(/@page\s*\{[^}]+\}/g, "");
await fs.writeFile(
  path.join(assets, "preview.css"),
  `/* Scoped preview rules: Default never emits this marker. */\n@scope (html:has(.inkpage-theme-marker)) {\n${theme.replace(/:root|\bhtml\b/g, ":scope")}\n}\n`,
);
await fs.access(path.join(assets, "licenses/vscode-markdown.txt"));
console.log("Prepared namespaced math resources and scoped preview CSS.");
