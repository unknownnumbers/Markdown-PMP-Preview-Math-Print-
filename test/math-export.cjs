"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { renderDocument } = require("../src/render.cjs");
const { createPdf, createImages } = require("../src/pdf.cjs");
const { layoutCss } = require("../src/export-options.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/math-export-regression");
const browserPath =
  process.argv[2] ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const wide = "$$" + Array(150).fill("x").join("+") + "$$ (wide)";
const source =
  String.raw`# Formula compatibility

*An emphasized formula $x^2$ remains rendered.*

Unsupported inline: $\fint_{B} u$.

Literal code: ` +
  "`purely $(n-2)$-unrectifiable set`" +
  String.raw`

\[\notACommand{x}\] (A)

` +
  wide;
const snapshot = {
  colors: {
    "--vscode-editor-foreground": "#333333",
    "--vscode-editor-background": "#ffffff",
    "--vscode-textPreformat-foreground": "#333333",
    "--vscode-textPreformat-background": "#eeeeee",
    "--vscode-textCodeBlock-background": "#eeeeee",
  },
  fontFamily: "Arial, sans-serif",
  fontSize: 16,
  lineHeight: 1.6,
  codeFontFamily: "Consolas, monospace",
};
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const theme of ["purple", "default"]) {
    const input = {
      extensionPath: root,
      sourceUri: pathToFileURL(path.join(output, "fixture.md")).href,
      markdown: source,
      options: { theme },
      snapshot: theme === "default" ? snapshot : undefined,
      fontMode: "file",
      markdownOptions: { math: { enabled: true } },
      layoutCss: layoutCss({}, "pdf"),
    };
    const rendered = await renderDocument(input);
    assert.match(rendered.html, /class="inkpage-math-fallback"/);
    assert.match(rendered.html, /data-inkpage-source=/);
    const pdf = await createPdf(rendered.html, { browserPath });
    await fs.writeFile(path.join(output, `${theme}.pdf`), pdf);
    console.log(`${theme}: PDF passed (${pdf.length} bytes)`);
  }
  const input = {
    extensionPath: root,
    sourceUri: pathToFileURL(path.join(output, "fixture.md")).href,
    markdown: source,
    options: { theme: "purple" },
    fontMode: "file",
    markdownOptions: { math: { enabled: true } },
    layoutCss: layoutCss({}, "png"),
  };
  const rendered = await renderDocument(input);
  const images = await createImages(rendered.html, {
    browserPath,
    format: "png",
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].readUInt32BE(16), 1800);
  await fs.writeFile(path.join(output, "fallback.png"), images[0]);
  const jpeg = await createImages(rendered.html, {
    browserPath,
    format: "jpeg",
  });
  assert.equal(jpeg.length, 1);
  assert.equal(jpeg[0].readUInt16BE(0), 0xffd8);
  await fs.writeFile(path.join(output, "fallback.jpeg"), jpeg[0]);
  const strict = await renderDocument({
    ...input,
    markdown: wide,
    markdownOptions: { math: { enabled: true, fallbackToCode: false } },
  });
  await assert.rejects(
    createImages(strict.html, { browserPath, format: "png" }),
    /Math is too wide/,
  );
  console.log("PNG/JPEG fallback and strict width errors passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
