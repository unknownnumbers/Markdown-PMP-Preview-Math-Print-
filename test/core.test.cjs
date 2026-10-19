"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { PALETTES, normalizeOptions, variableCss } = require("../src/theme.cjs");
const {
  createRenderer,
  renderFrontMatter,
  sanitizeRenderedHtml,
  embedImages,
  imageMime,
  renderDocument,
} = require("../src/render.cjs");
const { browserCandidates } = require("../src/pdf.cjs");

test("Default is neutral and only the three approved palettes can become themed CSS", () => {
  assert.deepEqual(Object.keys(PALETTES), [
    "default",
    "purple",
    "blue",
    "redblue",
  ]);
  assert.equal(PALETTES.blue.title, "#222222");
  assert.equal(PALETTES.blue.link, "#0057C2");
  assert.equal(
    normalizeOptions({
      theme: "};body{display:none}",
      fontSize: NaN,
      lineHeight: Infinity,
    }).fontSize,
    23,
  );
  assert.equal(normalizeOptions({ theme: "__proto__" }).theme, "default");
  assert.equal(normalizeOptions({ maxWidth: 99999 }).maxWidth, 1800);
  const css = variableCss({ theme: "<style>", fontSize: "1px;display:none" });
  assert.ok(!css.includes("<style>") && !css.includes("display:none"));
});

test("Standard Markdown preserves six heading levels, links, tasks, footnotes and syntax highlighting", () => {
  const html = createRenderer().render(
    '# 标题\n\n## 标题\n\n### 标题\n\n#### 四级\n\n##### 五级\n\n###### 六级\n\n[链接](https://example.com)\n\n- [x] 完成\n\n正文[^n]\n\n[^n]: 脚注\n\n```js\nconst value = "阅读";\n```',
    {},
  );
  for (let level = 1; level <= 6; level++)
    assert.match(html, new RegExp(`<h${level} `));
  assert.match(html, /id="标题-1"/);
  assert.match(html, /id="标题-2"/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked/);
  assert.match(html, /class="hljs-keyword"/);
  assert.match(html, /class="footnotes/);
});

test("Raw HTML scripts, events and style fetches cannot enter a portable export", () => {
  const html = sanitizeRenderedHtml(
    '<script>bad()</script><iframe src="file:///private"></iframe><img src="image.png" onerror="bad()"><a href="javascript:bad()">x</a><style>@import "https://bad";</style><td style="text-align:center;background:url(https://bad)">对齐</td><input type="file"><details open><summary>说明</summary>正文</details>',
  );
  assert.doesNotMatch(
    html,
    /<script|<iframe|<style|onerror|javascript:|https:\/\/bad|type="file"/,
  );
  assert.match(html, /text-align:center/);
  assert.match(html, /<details open/);
  assert.match(html, /type="checkbox" disabled/);
});

test("Front matter is hidden, printed or escaped without consuming the document", () => {
  const src = "---\ntitle: 阅读\nauthor: [甲, 乙]\n---\n# 正文";
  assert.match(renderFrontMatter(src).html, /阅读/);
  assert.equal(renderFrontMatter(src, "hide").html, "");
  assert.equal(renderFrontMatter(src, "hide").source, "# 正文");
  assert.match(renderFrontMatter(src, "codeBlock").html, /<pre/);
  assert.match(renderFrontMatter("---\na: [\n---\n# 正文").html, /<pre/);
});

test("Local images survive a move to another directory, with Unicode and spaces in paths", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDP0AAAAASUVORK5CYII=",
    "base64",
  );
  const visited = [];
  const result = await embedImages(
    '<img src="图片%20样张.png" alt="样张"><img src="/assets/test.png"><a href="../参考.md#节">参考</a>',
    {
      sourceUri: "file:///C:/notes/docs/note.md",
      workspaceRoot: "file:///C:/notes",
      outputPath: "C:\\exports\\note.html",
      readAsset: async (uri) => {
        visited.push(uri);
        return png;
      },
    },
  );
  assert.deepEqual(visited, [
    "file:///C:/notes/docs/%E5%9B%BE%E7%89%87%20%E6%A0%B7%E5%BC%A0.png",
    "file:///C:/notes/assets/test.png",
  ]);
  assert.equal((result.html.match(/data:image\/png;base64/g) || []).length, 2);
  assert.ok(!result.html.includes('src="图片'));
  assert.match(result.html, /href="\.\.\/notes\/.*#%E8%8A%82"/);
});

test("Missing or non-image files fail rather than being silently embedded", async () => {
  assert.throws(
    () => imageMime(Buffer.from("private text"), "secret.png"),
    /Unsupported image file/,
  );
  await assert.rejects(
    embedImages('<img src="missing.png">', {
      sourceUri: "file:///C:/note.md",
      readAsset: async () => {
        throw new Error("not found");
      },
    }),
    /Could not read local image/,
  );
});

test("Remote images are retained with a portability notice, and cancellations stop work", async () => {
  const result = await embedImages(
    '<img src="https://example.com/image.png">',
    {
      sourceUri: "file:///C:/note.md",
      readAsset: () => assert.fail("Must not fetch local data"),
    },
  );
  assert.equal(result.warnings.length, 1);
  assert.match(result.html, /https:\/\/example.com\/image.png/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    embedImages('<img src="image.png">', { signal: controller.signal }),
    { name: "AbortError" },
  );
});

test("HTML embeds every font and license without any installation-specific font path", async () => {
  const root = path.resolve(__dirname, "..");
  const result = await renderDocument({
    extensionPath: root,
    sourceUri: pathToFileURL(path.join(root, "examples/sample.md")).href,
    markdown: "# 阅读\n\n[资料](https://example.com)",
    options: { theme: "blue" },
  });
  assert.match(result.html, /--inkpage-title: #222222/);
  assert.match(result.html, /--inkpage-link: #0057C2/);
  assert.equal((result.html.match(/src:url\('data:font\//g) || []).length, 9);
  assert.doesNotMatch(result.html, /src:url\('file:/);
  assert.match(result.html, /SIL OPEN FONT LICENSE/);
  assert.match(result.html, /GUST Font License/);
  assert.match(result.html, /Content-Security-Policy/);
  assert.doesNotMatch(result.html, /<script/);
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "assets/font-manifest.json")),
  );
  assert.equal(manifest.length, 9);
});

test("Explicit browser paths are treated as a single executable, not a shell command", () => {
  assert.deepEqual(browserCandidates('"C:\\A B\\chrome.exe"'), [
    "C:\\A B\\chrome.exe",
  ]);
  assert.ok(
    browserCandidates("", "win32", { LOCALAPPDATA: "C:\\Test" }).some(
      (value) => value === "C:\\Test\\Microsoft\\Edge\\Application\\msedge.exe",
    ),
  );
});
