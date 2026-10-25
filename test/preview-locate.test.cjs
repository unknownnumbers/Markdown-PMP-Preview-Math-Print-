"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  findContextOffset,
  contextAt,
  wordAt,
} = require("../assets/preview-locate.js");
const {
  forwardLocation,
  sourceLocation,
} = require("../src/preview-source.cjs");

class Position {
  constructor(line, character) {
    Object.assign(this, { line, character });
  }
}
class Range {
  constructor(start, end) {
    Object.assign(this, { start, end });
  }
}
function documentOf(source) {
  const lines = source.split("\n");
  const document = {
    lineCount: lines.length,
    lineAt: (line) => ({ text: lines[line] }),
    offsetAt: (position) =>
      lines
        .slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + position.character,
    positionAt(offset) {
      let line = 0;
      while (line + 1 < lines.length && offset > lines[line].length)
        offset -= lines[line++].length + 1;
      return new Position(line, offset);
    },
    getText: (range) =>
      range
        ? source.slice(
            document.offsetAt(range.start),
            document.offsetAt(range.end),
          )
        : source,
  };
  return document;
}

test("Context matching locates formatted words, CJK, Unicode and collapsed line breaks in both directions", () => {
  for (const [source, visible, needle] of [
    ["A **target** beside `code`.", "A target beside code.", "target"],
    ["前面 **精確定位** 後面 😀.", "前面 精確定位 後面 😀.", "定位"],
    [
      "First line\nsecond line with café.",
      "First line second line with café.",
      "café",
    ],
    [
      "Read [label](./target.md) for details.",
      "Read label for details.",
      "label",
    ],
  ]) {
    const sourceAt = source.indexOf(needle) + 1;
    const visibleAt = visible.indexOf(needle) + 1;
    const sourceContext = contextAt(source, sourceAt);
    assert.equal(
      findContextOffset(
        visible,
        sourceContext.before,
        sourceContext.after,
        visibleAt,
      ),
      visibleAt,
    );
    const visibleContext = contextAt(needle, 1);
    assert.equal(
      findContextOffset(
        source,
        visibleContext.before,
        visibleContext.after,
        sourceAt,
      ),
      sourceAt,
    );
  }
  assert.equal(
    findContextOffset(
      "Repeated label. Repeated label.",
      "Repeated ",
      "label.",
      25,
    ),
    25,
  );
  assert.equal(
    findContextOffset("Unrelated text", "not present", "anything", 0),
    undefined,
  );
  const [first, last] = wordAt("Alpha target omega", 9);
  assert.equal("Alpha target omega".slice(first, last), "target");
});

test("Reverse navigation searches only the clicked block, preserves real line/column and falls back for math and tables", () => {
  const source =
    "duplicate target\n\nA **target** here.\nSoft line continuation.\n\nduplicate target\n";
  const document = documentOf(source);
  const blocks = { selected: { line: 2, end: 4, kind: "paragraph_open" } };
  const message = {
    line: 2.8,
    block: "selected",
    before: "tar",
    after: "get",
    horizontal: 0.5,
  };
  const position = sourceLocation(document, blocks, message, Position, Range);
  assert.deepEqual({ ...position }, { line: 2, character: 7 });
  const coarse = sourceLocation(
    document,
    blocks,
    { ...message, coarse: true },
    Position,
    Range,
  );
  assert.deepEqual(coarse, { line: 2, character: 0 });
  blocks.selected.kind = "tr_open";
  assert.deepEqual(sourceLocation(document, blocks, message, Position, Range), {
    line: 2,
    character: 0,
  });
});

test("Forward navigation includes the source column and treats inline formula contents as a block target", () => {
  const source = "Before $E=mc^2$ after target.";
  const document = documentOf(source);
  const math = { enabled: true, delimiters: ["dollars", "brackets"] };
  assert.equal(
    forwardLocation(document, new Position(0, 10), math).block,
    true,
  );
  const normal = forwardLocation(
    document,
    new Position(0, source.indexOf("target") + 2),
    math,
  );
  assert.equal(normal.block, false);
  assert.equal(normal.character, source.indexOf("target") + 2);
  assert.equal(normal.before.endsWith("ta"), true);
  assert.equal(
    forwardLocation(document, new Position(0, 10), { enabled: false }).block,
    false,
  );
});

test("Double-click source navigation is enabled by default while user settings remain authoritative", () => {
  assert.equal(
    require("../package.json").contributes.configurationDefaults[
      "markdown.preview.doubleClickToSwitchToEditor"
    ],
    true,
  );
});
