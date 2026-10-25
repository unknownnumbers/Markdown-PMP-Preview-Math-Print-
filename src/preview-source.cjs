"use strict";
const { findContextOffset, contextAt } = require("../assets/preview-locate.js");
const { createRenderer } = require("./render.cjs");

function forwardLocation(document, position, math) {
  const text = document.lineAt(position.line).text;
  const children = createRenderer({ math, commonPlugins: false }).parseInline(
    text,
    {},
  )[0].children;
  const block = children.some(
    (token) =>
      token.type.startsWith("inkpage_") &&
      token.meta.inkpageOffset <= position.character &&
      token.meta.inkpageEnd > position.character,
  );
  return {
    ...contextAt(text, position.character),
    character: position.character,
    lineLength: text.length,
    block,
  };
}

function sourceLocation(document, blocks, message, Position, Range) {
  const block = blocks?.[message.block];
  const startLine = block?.line ?? Math.floor(message.line);
  const endLine = Math.min(
    document.lineCount - 1,
    block ? block.end - 1 : startLine,
  );
  const start = new Position(startLine, 0);
  const end = new Position(endLine, document.lineAt(endLine).text.length);
  if (
    block &&
    !message.coarse &&
    ["paragraph_open", "heading_open", "list_item_open"].includes(block.kind)
  ) {
    const text = document.getText(new Range(start, end));
    const estimatedLine = Math.min(
      endLine,
      Math.max(startLine, Math.floor(message.line)),
    );
    const expected =
      document.offsetAt(new Position(estimatedLine, 0)) -
      document.offsetAt(start) +
      Math.round(
        document.lineAt(estimatedLine).text.length * (message.horizontal || 0),
      );
    const offset = findContextOffset(
      text,
      message.before || "",
      message.after || "",
      expected,
    );
    if (offset !== undefined)
      return document.positionAt(document.offsetAt(start) + offset);
  }
  return { line: startLine, character: 0 };
}

module.exports = { forwardLocation, sourceLocation };
