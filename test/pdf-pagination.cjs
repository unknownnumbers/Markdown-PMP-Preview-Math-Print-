"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { renderDocument } = require("../src/render.cjs");
const { createPdf } = require("../src/pdf.cjs");
const { layoutCss } = require("../src/export-options.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/pdfs/pagination");
const browserPath =
  process.argv[2] ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
(async () => {
  await fs.mkdir(output, { recursive: true });
  const items = Array.from(
    { length: 120 },
    (_, i) =>
      `ITEM_${String(i).padStart(3, "0")} 這段文字用來檢查長表格行的連續分頁與內容保留. $x_${i}^2+y^2=z^2$.`,
  ).join(" ");
  const markdown = `# Continuous table pagination\n\n| Term | Explanation | Reference |\n| --- | --- | --- |\n| \`ROW_START purely $(n-2)$-unrectifiable set\` | ${items} ROW_END | REF_COMPLETE |\n| FINAL_ROW | LAST_CELL_COMPLETE | LAST_REFERENCE |\n\nDOCUMENT_COMPLETE\n`;
  const rendered = await renderDocument({
    extensionPath: root,
    sourceUri: pathToFileURL(path.join(output, "fixture.md")).href,
    markdown,
    options: { theme: "purple" },
    fontMode: "file",
    layoutCss: layoutCss({}, "pdf"),
    markdownOptions: { math: { enabled: true } },
  });
  await fs.writeFile(path.join(output, "fixture.md"), markdown);
  await fs.writeFile(path.join(output, "fixture.html"), rendered.html);
  const start = performance.now();
  const pdf = await createPdf(rendered.html, { browserPath });
  await fs.writeFile(path.join(output, "complete.pdf"), pdf);
  const range = await createPdf(rendered.html, {
    browserPath,
    options: { pageRanges: "2-3" },
  });
  await fs.writeFile(path.join(output, "range.pdf"), range);
  console.log(
    JSON.stringify({
      bytes: pdf.length,
      rangeBytes: range.length,
      elapsedMs: Math.round(performance.now() - start),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
