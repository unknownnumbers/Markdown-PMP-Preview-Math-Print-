"use strict";
const { t } = require("./i18n.cjs");

const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PALETTES = Object.freeze({
  default: { name: "Default" },
  purple: {
    name: "Purple",
    title: "#8064A9",
    link: "#4657A1",
    accent: "#8064A9",
    code: "#745FB5",
    codeBg: "#F4F2F9",
    tint: "#F7F4FA",
    quoteBg: "#F7F4FA",
    quoteLine: "#B9A8D0",
    codeBlock: "#F7F7F9",
    border: "#E5DFEC",
    string: "#8D4B68",
    fn: "#53649B",
    keyword: "#8064A9",
    linkWeight: "400",
    linkLine: "1px",
  },
  blue: {
    name: "Blue-White",
    title: "#222222",
    link: "#0057C2",
    accent: "#6289B0",
    code: "#4F6277",
    codeBg: "#EEF3F8",
    tint: "#F2F6FA",
    quoteBg: "#F2F6FA",
    quoteLine: "#A7BCD2",
    codeBlock: "#F5F7FA",
    border: "#DDE5ED",
    string: "#655B8C",
    fn: "#3F6285",
    keyword: "#3F6285",
    linkWeight: "500",
    linkLine: "1.5px",
  },
  redblue: {
    name: "Blue-Red",
    title: "#2F4F70",
    link: "#963D50",
    accent: "#9A3F4B",
    code: "#6F5A80",
    codeBg: "#F4F1F7",
    tint: "#F3F6FA",
    quoteBg: "#FBF3F4",
    quoteLine: "#C18B96",
    codeBlock: "#F6F7FA",
    border: "#E0E3E9",
    string: "#8E4A5E",
    fn: "#395F88",
    keyword: "#2F4F70",
    linkWeight: "400",
    linkLine: "1px",
  },
});

function bounded(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeOptions(options = {}) {
  return {
    theme: Object.hasOwn(PALETTES, options.theme) ? options.theme : "default",
    fontSize: bounded(options.fontSize, 23, 12, 40),
    lineHeight: bounded(options.lineHeight, 1.7, 1.2, 2.5),
    maxWidth: bounded(options.maxWidth, 900, 480, 1800),
    pdfFontSize: bounded(options.pdfFontSize, 12, 8, 36),
  };
}

function variableCss(input) {
  const options = normalizeOptions(input);
  if (options.theme === "default") return "";
  const palette = PALETTES[options.theme];
  const values = {
    title: palette.title,
    link: palette.link,
    accent: palette.accent,
    code: palette.code,
    "code-bg": palette.codeBg,
    tint: palette.tint,
    "quote-bg": palette.quoteBg,
    "quote-line": palette.quoteLine,
    "code-block": palette.codeBlock,
    border: palette.border,
    string: palette.string,
    function: palette.fn,
    keyword: palette.keyword,
    "link-hover": darken(palette.link),
    "link-weight": palette.linkWeight,
    "link-line": palette.linkLine,
    "font-size": `${options.fontSize}px`,
    "line-height": options.lineHeight,
    "max-width": `${options.maxWidth}px`,
    "pdf-font-size": `${options.pdfFontSize}pt`,
  };
  // Fixed palette values and bounded numbers are the only values inserted into CSS.
  return `html body { ${Object.entries(values)
    .map(([key, value]) => `--inkpage-${key}: ${value};`)
    .join(" ")} }`;
}

function darken(hex) {
  return (
    "#" +
    hex
      .slice(1)
      .match(/../g)
      .map((x) =>
        Math.round(parseInt(x, 16) * 0.76)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const assetCache = new Map();
async function loadStyles(extensionPath, mode = "embedded") {
  const cacheKey = extensionPath + ":" + mode;
  if (assetCache.has(cacheKey)) return assetCache.get(cacheKey);
  const promise = (async () => {
    const assets = path.join(extensionPath, "assets");
    const [theme, manifest] = await Promise.all([
      fs.readFile(path.join(assets, "theme.css"), "utf8"),
      fs
        .readFile(path.join(assets, "font-manifest.json"), "utf8")
        .then(JSON.parse),
    ]);
    const faces = await Promise.all(
      manifest.map(async (face) => {
        const filename = path.join(assets, face.file);
        const source =
          mode === "embedded"
            ? `data:font/${face.format === "opentype" ? "otf" : "ttf"};base64,${(await fs.readFile(filename)).toString("base64")}`
            : pathToFileURL(filename).href;
        return `@font-face{font-family:'${face.family}';src:url('${source}') format('${face.format}');font-weight:${face.weight};font-style:${face.style};font-display:swap;}`;
      }),
    );
    const licenseDir = path.join(assets, "licenses", "fonts");
    const names = (await fs.readdir(licenseDir))
      .filter((name) => name.endsWith(".txt"))
      .sort();
    const licenses = await Promise.all(
      names.map(
        async (name) =>
          `${name}\n${await fs.readFile(path.join(licenseDir, name), "utf8")}`,
      ),
    );
    return `${faces.join("\n")}\n${theme}\n/* Bundled font notices and licenses\n${licenses.join("\n\n").replace(/\*\//g, "* /")}\n*/`;
  })();
  assetCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (error) {
    assetCache.delete(cacheKey);
    throw error;
  }
}

async function loadMathStyles(extensionPath, mode = "embedded") {
  const key = "math:" + extensionPath + ":" + mode;
  if (assetCache.has(key)) return assetCache.get(key);
  let css = await fs.readFile(
    path.join(extensionPath, "assets/math/math.css"),
    "utf8",
  );
  const matches = [...css.matchAll(/url\(([^)]+)\)/g)];
  for (const match of matches) {
    const relative = match[1].replace(/["']/g, "");
    const file = path.join(extensionPath, "assets/math", relative);
    const url =
      mode === "embedded"
        ? `data:font/${path.extname(file).slice(1)};base64,${(await fs.readFile(file)).toString("base64")}`
        : pathToFileURL(file).href;
    css = css.replace(match[0], `url('${url}')`);
  }
  css +=
    "\n/* KaTeX license\n" +
    (
      await fs.readFile(
        path.join(extensionPath, "assets/math/LICENSE.txt"),
        "utf8",
      )
    ).replace(/\*\//g, "* /") +
    "\n*/";
  assetCache.set(key, css);
  return css;
}
function cssValue(value) {
  return String(value).replace(/[<>{};\r\n]/g, " ");
}
async function loadNativeStyles(extensionPath, snapshot) {
  if (!snapshot?.colors)
    throw new Error(
      t("Default export requires the current VS Code appearance first."),
    );
  const [markdown, highlight] = await Promise.all(
    ["native-markdown.css", "native-highlight.css"].map((name) =>
      fs.readFile(path.join(extensionPath, "assets", name), "utf8"),
    ),
  );
  const variables = Object.entries(snapshot.colors)
    .filter(([key]) => /^--vscode-[\w-]+$/.test(key))
    .map(([key, value]) => `${key}:${cssValue(value)}`)
    .join(";");
  return `:root{${variables};--markdown-font-family:${cssValue(snapshot.fontFamily)};--markdown-font-size:${Number(snapshot.fontSize) || 14}px;--markdown-line-height:${Number(snapshot.lineHeight) || 1.6};--vscode-editor-font-family:${cssValue(snapshot.codeFontFamily)}}
  html,body{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
  a{color:var(--vscode-textLink-foreground)}a:hover,a:active{color:var(--vscode-textLink-activeForeground)}
  code{color:var(--vscode-textPreformat-foreground);background:var(--vscode-textPreformat-background);font-family:var(--vscode-editor-font-family)}
  blockquote{background:var(--vscode-textBlockQuote-background);border-color:var(--vscode-textBlockQuote-border)}
  ${markdown}\n${highlight}\nhtml{padding:0}body{box-sizing:border-box;margin:0 auto;max-width:100%;padding:24px 26px}.markdown-body{color:inherit;font:inherit}pre code{color:inherit;background:transparent}`;
}
module.exports = {
  PALETTES,
  normalizeOptions,
  variableCss,
  loadStyles,
  loadMathStyles,
  loadNativeStyles,
  cssValue,
};
