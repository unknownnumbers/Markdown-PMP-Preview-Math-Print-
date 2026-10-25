"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { renderDocument } = require("../src/render.cjs");
const { createPdf } = require("../src/pdf.cjs");
const { layoutCss } = require("../src/export-options.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/pdfs/parts");
(async () => {
  await fs.mkdir(output, { recursive: true });
  const settings = { header: ["filename", "date"], footer: ["pageNumber"] };
  const rendered = await renderDocument({
    extensionPath: root,
    sourceUri: pathToFileURL(path.join(output, "fixture.md")).href,
    markdown:
      '# First\n\nFIRST_COMPLETE[^note] [Second](#second) [Target](#target).\n\n## Second\n\nSECOND_COMPLETE $x^2$. [First](#first) [Web](https://example.com).\n\n<span id="target">TARGET_COMPLETE</span>\n\n[^note]: FOOTNOTE_COMPLETE.',
    options: { theme: "purple" },
    fontMode: "file",
    layoutCss: layoutCss(settings, "pdf"),
    markdownOptions: { math: { enabled: true } },
  });
  const padding = "<!--" + "x".repeat(600000) + "-->";
  const html = rendered.html
    .replace('<h1 id="first"', padding + '<h1 id="first"')
    .replace('<h2 id="second"', padding + '<h2 id="second"');
  const browser = {
    browserPath:
      process.argv[2] ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    extensionPath: root,
    title: "長文測試.md",
    options: settings,
    onProgress: console.log,
  };
  const pdf = await createPdf(html, browser);
  await fs.writeFile(path.join(output, "complete.pdf"), pdf);
  const range = await createPdf(html, {
    ...browser,
    options: { ...settings, pageRanges: "2" },
  });
  await fs.writeFile(path.join(output, "range.pdf"), range);
  console.log(JSON.stringify({ bytes: pdf.length }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
