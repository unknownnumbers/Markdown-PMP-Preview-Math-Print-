"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Parser } = require("htmlparser2");
const {
  splitPdfHtml,
  preparePartLinks,
  selectedPages,
} = require("../src/pdf-parts.cjs");
const document = (body) =>
  `<!doctype html><html><head><title>Test</title></head><body><main class="markdown-body" dir="auto">${body}</main></body></html>`;
function cells(html) {
  const values = [];
  let start;
  const parser = new Parser({
    onopentag(name) {
      if (name === "td") start = parser.startIndex;
    },
    onclosetag(name) {
      if (name === "td") {
        values.push(html.slice(start, parser.endIndex + 1));
        start = undefined;
      }
    },
  });
  parser.end(html);
  return values;
}
test("PDF sections preserve every table cell in order and repeat table headers", () => {
  const rows = Array.from(
    { length: 24 },
    (_, i) =>
      `<tr><td>ROW_${i}</td><td><em>Value ${i}</em> ${"text ".repeat(20)}</td></tr>`,
  ).join("\n");
  const html = document(
    `<h1 id="title">Title</h1><table><thead><tr><th>Term</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><p>THE_END</p>`,
  );
  const parts = splitPdfHtml(html, 600);
  assert.ok(parts.length > 2);
  assert.deepEqual(parts.flatMap(cells), cells(html));
  assert.ok(
    parts.every(
      (part) => part.startsWith("<!doctype html>") && part.endsWith("</html>"),
    ),
  );
  assert.ok(
    parts
      .filter((part) => part.includes("<table>"))
      .every(
        (part) => part.includes("<thead>") && part.includes("</tbody></table>"),
      ),
  );
  assert.ok(parts.at(-1).includes("THE_END"));
  assert.ok(
    parts[0].includes("ROW_0"),
    "The heading stays with its first content",
  );
});
test("PDF splitting keeps a single large table row intact", () => {
  const html = document(
    `<table><thead><tr><th>Value</th></tr></thead><tbody><tr><td>${"large ".repeat(500)}</td></tr><tr><td>SECOND</td></tr></tbody></table>`,
  );
  const parts = splitPdfHtml(html, 500);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.flatMap(cells), cells(html));
});
test("Small PDFs bypass splitting and link rewriting is limited to local anchors", () => {
  const html = document(
    '<h1 id="標題">Heading</h1><a href="#%E6%A8%99%E9%A1%8C">Jump</a><a href="https://example.com/page#part">Web</a>',
  );
  assert.deepEqual(splitPdfHtml(html), [html]);
  const prepared = preparePartLinks(html);
  assert.match(
    prepared,
    /href="https:\/\/markdown-pmp\.invalid\/destination\/%E6%A8%99%E9%A1%8C"/,
  );
  assert.match(prepared, /href="https:\/\/example\.com\/page#part"/);
  assert.match(prepared, /opacity:0/);
  assert.match(prepared, /href="#標題"/);
});
test("Global PDF page ranges select real document pages without duplicate entries", () => {
  assert.deepEqual(
    [...selectedPages("2-4,1,3", 5)].sort((a, b) => a - b),
    [0, 1, 2, 3],
  );
  assert.deepEqual([...selectedPages("4-99", 5)], [3, 4]);
  assert.deepEqual([...selectedPages("", 3)], [0, 1, 2]);
  assert.throws(() => selectedPages("8", 5), /contains no pages/);
});
