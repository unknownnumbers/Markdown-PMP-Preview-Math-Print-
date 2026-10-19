"use strict";
const { t } = require("./i18n.cjs");
const PAPERS = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
};
const number = (value, fallback, min, max, label) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(t("{0} must be between {1} and {2}.", label, min, max));
  return n;
};
function normalizeExport(input = {}) {
  const paper = input.paper || "A4";
  if (!PAPERS[paper] && paper !== "Custom")
    throw new Error(t("Select a valid paper size."));
  let [width, height] = PAPERS[paper] || [
    number(input.width, 210, 40, 2000, t("Paper width")),
    number(input.height, 297, 40, 2000, t("Paper height")),
  ];
  const landscape = Boolean(input.landscape);
  if (landscape && width < height) [width, height] = [height, width];
  const margins = Object.fromEntries(
    ["top", "right", "bottom", "left"].map((side) => [
      side,
      number(input.margins?.[side], 20, 0, 1000, t("Page margin")),
    ]),
  );
  if (
    margins.left + margins.right >= width - 10 ||
    margins.top + margins.bottom >= height - 10
  )
    throw new Error(
      t("Margins leave too little content space; at least 10 mm is required."),
    );
  const pageRanges = String(input.pageRanges || "").trim();
  if (pageRanges && !/^\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*$/.test(pageRanges))
    throw new Error(
      t("Use page ranges such as 1-5,8, or leave empty for all pages."),
    );
  for (const part of pageRanges.split(",").filter(Boolean)) {
    const [a, b = a] = part.split("-").map(Number);
    if (a < 1 || b < a)
      throw new Error(
        t("Page ranges must start at 1, with the end not before the start."),
      );
  }
  const valid = ["filename", "date", "pageNumber"];
  const header = input.header || [];
  const footer = input.footer || ["pageNumber"];
  if (
    ![header, footer].every(
      (x) => Array.isArray(x) && x.every((v) => valid.includes(v)),
    )
  )
    throw new Error(
      t("Headers and footers support filename, date and pageNumber only."),
    );
  if (
    (header.length && margins.top < 12) ||
    (footer.length && margins.bottom < 12)
  )
    throw new Error(
      t(
        "Headers and footers require at least 12 mm on the corresponding margin.",
      ),
    );
  return {
    paper,
    width,
    height,
    landscape,
    margins,
    pageRanges,
    header: [...new Set(header)],
    footer: [...new Set(footer)],
    fontSize: number(input.fontSize, 12, 8, 36, t("PDF font size")),
    scale: number(input.scale, 1, 0.1, 2, t("PDF scale")),
    imageWidth: Math.round(
      number(input.imageWidth, 900, 320, 4096, t("Image layout width")),
    ),
    imageScale: number(input.imageScale, 2, 1, 3, t("Image resolution")),
    jpegQuality: Math.round(
      number(input.jpegQuality, 90, 1, 100, t("JPEG quality")),
    ),
  };
}
function layoutCss(input, format, snapshot) {
  const o = normalizeExport(input),
    m = o.margins;
  const printColors = snapshot
    ? `color:${snapshot.colors["--vscode-editor-foreground"] || "#333"}!important;background:${snapshot.colors["--vscode-editor-background"] || "#fff"}!important;`
    : "";
  return `@page{${snapshot ? `background:${snapshot.colors["--vscode-editor-background"] || "#fff"};` : ""}size:${o.width}mm ${o.height}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
  @media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;${printColors}}html body{font-size:${o.fontSize}pt!important;padding:0!important;margin:0!important;max-width:none!important;width:auto!important}h1,h2,h3,h4,h5,h6{break-after:avoid}thead{display:table-header-group}tr,img,.inkpage-math-display{break-inside:avoid}}
  ${["png", "jpeg"].includes(format) ? `html body{width:${o.imageWidth}px;max-width:${o.imageWidth}px}` : ""}`;
}
const escape = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function headerTemplate(items, title, color = "#666") {
  const pieces = items.map((x) =>
    x === "filename"
      ? escape(title)
      : x === "date"
        ? escape(new Date().toLocaleDateString("sv-SE"))
        : '<span class="pageNumber"></span> / <span class="totalPages"></span>',
  );
  return `<div style="width:100%;padding:0 20px;box-sizing:border-box;text-align:center;font:9px Arial,sans-serif;color:${escape(color)}">${pieces.join(" · ") || "<span></span>"}</div>`;
}
module.exports = { normalizeExport, layoutCss, headerTemplate, PAPERS };
