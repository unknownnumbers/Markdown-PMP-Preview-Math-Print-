"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseDocument } = require("htmlparser2");
const {
  renderLargeDocument,
  chunkAtLine,
  DocumentSearch,
  lineAfterChanges,
} = require("../src/large-preview-document.cjs");
function nodes(html, name) {
  const found = [];
  function visit(node) {
    if (node.name === name) found.push(node);
    for (const child of node.children || []) visit(child);
  }
  visit(parseDocument(html));
  return found;
}
const options = { theme: "purple", math: { enabled: false } };

test("Edits above or across the reading position keep it on the corresponding source content", () => {
  const change = (start, end, text) => ({
    range: { start: { line: start }, end: { line: end } },
    text,
  });
  assert.equal(lineAfterChanges(100.5, [change(0, 0, "One\nTwo\n")]), 102.5);
  assert.equal(lineAfterChanges(100.5, [change(20, 30, "")]), 90.5);
  assert.equal(
    lineAfterChanges(100.5, [change(99, 120, "replacement\n")]),
    100,
  );
  assert.equal(
    lineAfterChanges(100.5, [change(10, 10, "A\n"), change(50, 60, "")]),
    91.5,
  );
});

test("A continuous list is split between complete items with source locations for the entire document", () => {
  const source = Array.from(
    { length: 3000 },
    (_, i) => `- Item ${i}: English \`code ${i}\` and العربية 中文.\n`,
  ).join("");
  const model = renderLargeDocument(source, options);
  assert.ok(model.chunks.length > 80);
  const full = model.chunks.map((x) => x.html).join("");
  assert.equal(nodes(full, "li").length, 3000);
  assert.equal(nodes(full, "code").length, 3000);
  assert.ok(nodes(full, "ul").every((x) => !x.attribs.dir));
  assert.ok(nodes(full, "li").every((x) => x.attribs.dir === "auto"));
  assert.ok(model.chunks.every((x) => x.anchors.length <= 32));
  assert.equal(chunkAtLine(model, 2999), model.chunks.length - 1);
  assert.match(model.chunks.at(-1).html, /code 2999/);
  assert.equal(model.sourceAnchors.at(-1).line, 2999);
});

test("Ordered list continuations preserve numbering and long tables keep every row", () => {
  const ordered = renderLargeDocument(
    Array.from(
      { length: 300 },
      (_, i) => `${i + 5}. Entry ${i} with a long description and more text.\n`,
    ).join(""),
    options,
  );
  const lists = ordered.chunks.flatMap((x) => nodes(x.html, "ol"));
  assert.ok(lists.length > 1);
  let next = 5;
  for (const list of lists) {
    assert.equal(Number(list.attribs.start), next);
    next += list.children.filter((x) => x.name === "li").length;
  }
  assert.equal(next, 305);
  const rows = Array.from(
    { length: 600 },
    (_, i) =>
      `| ${i} | Complete row ${i} with \`inline code\` | Description ${"text ".repeat(i % 9)} |\n`,
  ).join("");
  const model = renderLargeDocument(
    "| A | B | C |\n|---|---|---|\n" + rows,
    options,
  );
  const full = model.chunks.map((x) => x.html).join("");
  assert.equal(nodes(full, "tr").length, 601);
  assert.equal(nodes(full, "thead").length, 1);
  assert.ok(nodes(full, "table").length > 10);
  assert.equal(
    new Set(nodes(full, "table").map((x) => x.attribs["data-pmp-table"])).size,
    1,
  );
  assert.ok(nodes(model.tables[0], "tr").length < 15);
});

test("Document-wide references, unique headings and math macros survive chunk boundaries", () => {
  const source =
    "# Same\n\n[First][ref]\n\n$\\gdef\\myx{x}$\n\n" +
    "- Padding text with some inline `code`\n".repeat(800) +
    "\n# Same\n\n[Last][ref] and $\\myx^2$\n\n[ref]: https://example.com/target\n";
  const model = renderLargeDocument(source, {
    ...options,
    math: { enabled: true },
  });
  const full = model.chunks.map((x) => x.html).join("");
  assert.equal((full.match(/https:\/\/example.com\/target/g) || []).length, 2);
  assert.deepEqual(
    model.headings.map((x) => x.id),
    ["same", "same-1"],
  );
  assert.ok(model.idChunks["same-1"] > model.idChunks.same);
  assert.match(full, /inkpage-katex/);
  assert.doesNotMatch(full, /inkpage-math-error/);
});

test("Search covers unloaded chunks, uses literal queries and reports the correct source location", () => {
  const source =
    "- Ordinary text\n".repeat(2000) + "- Last: [A+B]? and [a+b]?\n";
  const model = renderLargeDocument(source, options);
  const search = new DocumentSearch(model, "[a+b]?");
  assert.equal(search.total, 2);
  const result = search.at(-1);
  assert.equal(result.index, 1);
  assert.equal(result.line, 2000);
  assert.equal(result.chunk, model.chunks.length - 1);
  assert.equal(
    model.chunks[result.chunk].text.slice(
      result.start,
      result.start + result.length,
    ),
    "[a+b]?",
  );
  assert.equal(new DocumentSearch(model, "").total, 0);
});

test("Source line numbers include front matter and sanitized HTML keeps safe preview mappings", () => {
  const model = renderLargeDocument(
    "---\ntitle: Example\n---\n\n# Heading\n\n```js\nconst x = 1;\n```\n\n<script>alert(1)</script>\n\n![Local](image.png)\n",
    { ...options, assetUri: (value) => "https://local.example/" + value },
  );
  assert.equal(model.headings[0].line, 4);
  const full = model.chunks.map((x) => x.html).join("");
  assert.match(full, /data-pmp-line="6"/);
  assert.doesNotMatch(full, /<script/);
  assert.match(full, /https:\/\/local.example\/image.png/);
  assert.match(full, /loading="lazy"/);
});
