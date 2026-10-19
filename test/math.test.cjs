"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const MarkdownIt = require("markdown-it");
const { createRenderer, renderDocument } = require("../src/render.cjs");
const { installPreview } = require("../src/preview.cjs");
const { normalizeMath } = require("../src/math.cjs");
const { normalizeExport, layoutCss } = require("../src/export-options.cjs");
const { PALETTES } = require("../src/theme.cjs");
const root = path.resolve(__dirname, "..");
test("Reading mode names match the four confirmed labels", () => {
  assert.deepEqual(
    Object.values(PALETTES).map((p) => p.name),
    ["Default", "Purple", "Blue-White", "Blue-Red"],
  );
});
test("Dollar and bracket syntaxes coexist; code and escaped currency remain ordinary Markdown", () => {
  const md = createRenderer({ math: { enabled: true } }),
    env = {};
  const html = md.render(
    String.raw`Inline $x^2$ and \(\frac{a}{b}\).

$$\sqrt{x}$$ (one)

\[\sum_{i=1}^n i\] (two)

\$10 and \$20, ` + '`$code$`\n\n```js\nconst s="$literal$";\n```',
    env,
  );
  assert.equal((html.match(/class="inkpage-math(?: |")/g) || []).length, 4);
  assert.match(html, /inkpage-equation-number.*\(one\)/);
  assert.match(html, /<svg/);
  assert.match(html, /<math /);
  assert.match(html, /\$code\$/);
  assert.match(html, /\$literal\$/);
  assert.equal(env.inkpageMathErrors, undefined);
});
test("Macros persist within a document but never leak to another document", () => {
  const md = createRenderer({
      math: { enabled: true, macros: { "\\RR": "\\mathbb{R}" } },
    }),
    a = {},
    b = {};
  md.render(String.raw`$\gdef\local{x}\RR$ then $\local$`, a);
  assert.equal(a.inkpageMathErrors, undefined);
  md.render(String.raw`$\local$`, b);
  assert.equal(b.inkpageMathErrors.length, 1);
});
test("Only explicitly numbered equations receive labels, and table errors retain source lines", async () => {
  const md = createRenderer({ math: { enabled: true } });
  const html = md.render(
    String.raw`$$x+y$$

\[x-y\]

$$x=y$$ (A)`,
    {},
  );
  assert.equal(
    (html.match(/class="inkpage-equation-number"/g) || []).length,
    1,
  );
  assert.match(html, /\(A\)/);
  await assert.rejects(
    renderDocument({
      extensionPath: root,
      sourceUri: "file:///C:/notes/note.md",
      options: { theme: "blue" },
      fontMode: "file",
      markdownOptions: { math: { enabled: true } },
      markdown: "# Title\n\n| Formula |\n| --- |\n| $\\notACommand$ |",
    }),
    /Line 5:/,
  );
  assert.equal(
    normalizeMath({ enabled: false, delimiters: ["invalid"] }).enabled,
    false,
  );
});
test("Math sanitizer preserves trusted SVG/MathML, escapes labels, and export errors have source lines", async () => {
  const input = {
    extensionPath: root,
    sourceUri: "file:///C:/notes/note.md",
    options: { theme: "blue" },
    fontMode: "file",
    markdownOptions: { math: { enabled: true } },
  };
  const result = await renderDocument({
    ...input,
    markdown: String.raw`$$\sqrt{a^2+b^2}$$ (<img/src=x/onerror=bad>)`,
  });
  assert.match(result.html, /<svg/);
  assert.match(result.html, /<math /);
  assert.doesNotMatch(result.html, /<img src="x"|onerror="bad"/);
  await assert.rejects(
    renderDocument({
      ...input,
      markdown: "# Title\n\n" + String.raw`$\notACommand$`,
    }),
    /Line 3:/,
  );
  const off = await renderDocument({
    ...input,
    markdown: "$\\notACommand$",
    markdownOptions: { math: { enabled: false } },
  });
  assert.doesNotMatch(off.html, /class="inkpage-math/);
});
test("Default really bypasses Inkpage extras; native math rules are restored even after parse failures", () => {
  let theme = "default",
    enabled = true;
  const md = new MarkdownIt(),
    base = new MarkdownIt();
  function nativeRule() {
    return false;
  }
  md.inline.ruler.before("escape", "math_inline", nativeRule);
  installPreview(
    md,
    () => ({ theme }),
    () => ({ enabled }),
    () => "html body{--test:1}",
  );
  const source = "Text[^a]\n\n[^a]: note\n\n- [x] task";
  enabled = false;
  assert.equal(md.render(source, {}), base.render(source, {}));
  assert.ok(md.inline.ruler.getRules("").includes(nativeRule));
  enabled = true;
  theme = "purple";
  assert.match(md.render(source, {}), /footnotes/);
  assert.ok(md.inline.ruler.getRules("").includes(nativeRule));
  theme = "default";
  enabled = false;
  assert.equal(md.render(source, {}), base.render(source, {}));
});
test("Conflicting syntaxes and impossible paper/margin combinations fail clearly", () => {
  assert.throws(
    () => normalizeMath({ delimiters: ["dollars", "kramdown"] }),
    /overlap/,
  );
  assert.throws(
    () => normalizeMath({ delimiters: ["gitlab", "julia"] }),
    /overlap/,
  );
  assert.throws(
    () => normalizeExport({ margins: { left: 150, right: 150 } }),
    /content space/,
  );
  assert.throws(
    () => normalizeExport({ pageRanges: "8-3" }),
    /end not before the start/,
  );
  const c = normalizeExport({
    paper: "Custom",
    width: 100,
    height: 200,
    landscape: true,
    footer: [],
  });
  assert.equal(c.width, 200);
  assert.match(layoutCss(c, "pdf"), /size:200mm 100mm/);
});
