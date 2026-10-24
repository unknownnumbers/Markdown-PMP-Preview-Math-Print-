"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MarkdownIt = require("markdown-it");
const { installPreview } = require("../src/preview.cjs");

function preview(theme) {
  const md = new MarkdownIt({ html: true });
  installPreview(
    md,
    () => ({ theme }),
    () => ({ enabled: false }),
    () => "",
  );
  // Match VS Code's source-map rule, which runs after extension plugins.
  md.core.ruler.push("source_map_data_attribute", (state) => {
    for (const token of state.tokens)
      if (token.map && token.type !== "inline") {
        token.attrSet("data-line", String(token.map[0]));
        token.attrJoin("class", "code-line");
        token.attrJoin("dir", "auto");
      }
  });
  return md;
}

test("Large preview lists retain item direction, source lines and all content without auto-directed containers", () => {
  const source =
    "- English `code`\n- العربية `code`\n".repeat(1500) +
    "\n1. First\n2. Second\n";
  for (const theme of ["default", "purple"]) {
    const md = preview(theme);
    const env = {};
    const tokens = md.parse(source, env);
    const html = md.renderer.render(tokens, md.options, env);
    assert.equal((html.match(/<li\b/g) || []).length, 3002);
    assert.equal((html.match(/<li[^>]*dir="auto"/g) || []).length, 3002);
    assert.doesNotMatch(html, /<(?:ul|ol)\b[^>]*dir="auto"/);
    assert.match(html, /<ul data-line="0" class="code-line">/);
    assert.match(html, /العربية <code>code<\/code>/);
    assert.ok(
      tokens
        .filter((token) => /^(?:bullet|ordered)_list_open$/.test(token.type))
        .every((token) => token.attrGet("dir") === "auto"),
    );
    assert.equal(md.renderer.render(tokens, md.options, env), html);
  }
});

test("Nested list items, paragraphs and explicit raw HTML keep their direction settings", () => {
  const md = preview("default");
  const html = md.render(
    '- العربية\n  1. עברית\n\nA paragraph.\n\n<ul dir="auto"><li>Explicit HTML</li></ul>\n',
  );
  assert.match(html, /<li[^>]*dir="auto">العربية/);
  assert.match(html, /<li[^>]*dir="auto">עברית/);
  assert.match(html, /<p[^>]*dir="auto">A paragraph/);
  assert.equal((html.match(/<(?:ul|ol)\b[^>]*dir="auto"/g) || []).length, 1);
  assert.match(html, /<ul dir="auto"><li>Explicit HTML<\/li><\/ul>/);
});

test("Only large themed previews request batched fonts, keeping the complete content", () => {
  const source = "Content ".repeat(40_000);
  for (const theme of ["default", "purple"]) {
    const md = preview(theme);
    assert.doesNotMatch(md.render("Short document"), /data-pmp-batch-fonts/);
    const html = md.render(source);
    assert.equal(html.includes(source.trimEnd()), true);
    assert.equal(html.includes("data-pmp-batch-fonts"), theme === "purple");
  }
});
