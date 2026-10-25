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

test("Repeated formulas reflect later macro definitions and keep their own source locations", () => {
  const md = createRenderer({ math: { enabled: true } });
  const env = {};
  const output = md.render(
    String.raw`$\gdef\pmpvalue{x}$

$\pmpvalue$ then $\pmpvalue$

$\gdef\pmpvalue{y}$

$\pmpvalue$ then $\pmpvalue$`,
    env,
  );
  const { parseDocument } = require("htmlparser2");
  const formulas = [];
  function visit(node) {
    if (node.attribs?.class === "inkpage-math") formulas.push(node);
    for (const child of node.children || []) visit(child);
  }
  const text = (node) =>
    node.type === "text" ? node.data : (node.children || []).map(text).join("");
  visit(parseDocument(output));
  assert.match(text(formulas[1]), /^x/);
  assert.match(text(formulas[2]), /^x/);
  assert.match(text(formulas[4]), /^y/);
  assert.match(text(formulas[5]), /^y/);
  assert.deepEqual(
    formulas.map((node) => node.attribs["data-inkpage-line"]),
    ["1", "3", "3", "5", "7", "7"],
  );
  assert.equal(env.inkpageMathErrors, undefined);
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
      markdownOptions: { math: { enabled: true, fallbackToCode: false } },
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
      markdownOptions: { math: { enabled: true, fallbackToCode: false } },
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
test("Unrenderable inline and display formulas retain their original delimiters as code and allow export", async () => {
  const { parseDocument } = require("htmlparser2");
  const rawInline = String.raw`$\fint_{B} u$`;
  const rawBlock = String.raw`\[\notACommand{x}\] (A)`;
  const result = await renderDocument({
    extensionPath: root,
    sourceUri: "file:///C:/notes/note.md",
    options: { theme: "blue" },
    fontMode: "file",
    markdownOptions: { math: { enabled: true } },
    markdown: rawInline + " and $x^2$\n\n" + rawBlock,
  });
  const codes = [];
  const visit = (node) => {
    if (
      node.name === "code" &&
      node.attribs.class?.includes("inkpage-math-fallback")
    )
      codes.push(node.children.map((child) => child.data || "").join(""));
    for (const child of node.children || []) visit(child);
  };
  visit(parseDocument(result.html));
  assert.deepEqual(codes, [rawInline, rawBlock]);
  assert.match(result.html, /<math /);
  assert.doesNotMatch(result.html, /class="inkpage-math-error/);
});

test("Dollar delimiters accept inner whitespace without swallowing adjacent formulas, currency or escaped dollars", () => {
  const md = createRenderer({ math: { enabled: true } });
  const env = {};
  const html = md.render(
    String.raw`$\vert x-z\vert $ is outward, then $x=z$. Also $ x+y $. Price $10 and $20; escaped \$5. $\text{a\$b}$`,
    env,
  );
  assert.equal((html.match(/class="inkpage-math(?: |")/g) || []).length, 4);
  assert.equal(env.inkpageMathErrors, undefined);
  assert.match(html, /Price \$10 and \$20/);
  assert.match(html, /is outward, then/);
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

test("Long previews keep configuration reads bounded and refresh cached-token appearance and macros", () => {
  let theme = "purple";
  let macros = { "\\RR": "x" };
  let optionReads = 0;
  let mathReads = 0;
  const resources = [];
  const md = new MarkdownIt();
  installPreview(
    md,
    (resource) => {
      optionReads++;
      resources.push(resource);
      return { theme };
    },
    () => {
      mathReads++;
      return { enabled: true, macros };
    },
    ({ theme }) => `html{--test-theme:${theme}}`,
  );
  const env = { currentDocument: "file:///long.md" };
  const source = "$\\RR$\n\n" + "Text with `code` and a link.\n\n".repeat(2000);
  const tokens = md.parse(source, env);
  const first = md.renderer.render(tokens, md.options, env);
  assert.ok(
    optionReads <= 4,
    `Theme configuration was read ${optionReads} times`,
  );
  assert.ok(mathReads <= 4, `Math configuration was read ${mathReads} times`);
  assert.ok(resources.every((resource) => resource === env.currentDocument));
  assert.match(first, /--test-theme:purple/);
  assert.equal(env.inkpageMathErrors, undefined);

  theme = "blue";
  macros = { "\\RR": "y" };
  const second = md.renderer.render(tokens, md.options, env);
  assert.match(second, /--test-theme:blue/);
  assert.notEqual(second, first);
  assert.equal(env.inkpageMathErrors, undefined);
  macros = {};
  md.renderer.render(tokens, md.options, env);
  assert.equal(env.inkpageMathErrors.length, 1);

  theme = "default";
  const final = md.render("Plain text", env);
  assert.doesNotMatch(final, /inkpage-theme-marker/);
});

test("Inline preview parsing also reuses settings and failed renders release their snapshot", () => {
  let theme = "purple";
  let reads = 0;
  let fail = true;
  const md = new MarkdownIt();
  md.renderer.rules.text = (tokens, i) => {
    if (fail) throw new Error("Render failure");
    return tokens[i].content;
  };
  installPreview(
    md,
    () => ({ theme }),
    () => {
      reads++;
      return { enabled: true };
    },
    ({ theme }) => `html{--test-theme:${theme}}`,
  );
  assert.throws(
    () => md.renderInline("Text `code` ".repeat(2000)),
    /Render failure/,
  );
  assert.ok(reads <= 4, `Math configuration was read ${reads} times`);
  fail = false;
  theme = "blue";
  assert.match(md.renderInline("Now readable"), /--test-theme:blue/);
});
