"use strict";

const { parseDocument } = require("htmlparser2");
const serialize = require("dom-serializer").default;
const { restoreMath } = require("./math.cjs");
const {
  createRenderer,
  renderFrontMatter,
  sanitizeRenderedHtml,
} = require("./render.cjs");

// Keep lists and tables in the same document parse: references, footnotes,
// equation macros and heading IDs must not restart at a viewport boundary.
const CHUNK_BYTES = 18_000;
const CHUNK_ANCHORS = 32;
const tag = (node) => node.type === "tag";
const html = (node) => serialize(node, { encodeEntities: "utf8" });
function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}
function textOf(node, content) {
  if (node.type === "text")
    return content ? content.text(node.data) : node.data;
  if (node.name === "annotation") return "";
  if (node.attribs?.class?.includes("inkpage-katex-mathml")) return "";
  return (node.children || []).map((child) => textOf(child, content)).join("");
}
function clone(node, children, continuation = false, more = false) {
  const copy = { ...node, attribs: { ...node.attribs }, children };
  if (continuation) {
    delete copy.attribs.id;
    copy.attribs.class = `${copy.attribs.class || ""} pmp-continued`.trim();
  }
  if (more)
    copy.attribs.class = `${copy.attribs.class || ""} pmp-continues`.trim();
  return copy;
}
function pack(items, size, count) {
  const groups = [];
  let group = [],
    bytes = 0,
    anchors = 0;
  for (const item of items) {
    const n = size(item),
      a = count(item);
    if (
      group.length &&
      (bytes + n > CHUNK_BYTES || anchors + a > CHUNK_ANCHORS)
    ) {
      groups.push(group);
      group = [];
      bytes = anchors = 0;
    }
    group.push(item);
    bytes += n;
    anchors += a;
  }
  if (group.length) groups.push(group);
  return groups;
}
function anchorCount(node) {
  let n = 0;
  walk(node, (x) => {
    if (x.attribs?.["data-pmp-line"] !== undefined) n++;
  });
  return n;
}
function splitTable(node, tables, content) {
  const heads = (node.children || []).filter(
    (x) => x.name === "thead" || x.name === "caption" || x.name === "colgroup",
  );
  const feet = (node.children || []).filter((x) => x.name === "tfoot");
  const rows = [];
  for (const child of node.children || []) {
    if (child.name === "tbody")
      rows.push(...child.children.filter((x) => x.name === "tr"));
    else if (child.name === "tr") rows.push(child);
  }
  if (!rows.length) return [node];
  const tableId = String(tables.length);
  const samples = new Set([0, rows.length - 1]);
  for (let i = 1; i < 5; i++) samples.add(Math.floor((rows.length * i) / 5));
  // A long example from each column prevents the first viewport from assigning
  // column widths that make a later part of the same table unreadable.
  const longest = [];
  rows.forEach((row, index) => {
    row.children.filter(tag).forEach((cell, column) => {
      const length = textOf(cell, content).length;
      if (!longest[column] || length > longest[column].length)
        longest[column] = { length, index };
    });
  });
  for (const entry of longest) if (entry) samples.add(entry.index);
  const tbody = (children) => ({
    type: "tag",
    name: "tbody",
    attribs: {},
    children,
  });
  const widthSample = (node) =>
    tag(node)
      ? clone(
          node,
          ["td", "th"].includes(node.name)
            ? [{ type: "text", data: textOf(node, content).slice(0, 160) }]
            : (node.children || []).map(widthSample),
        )
      : node;
  tables.push(
    html(
      clone(node, [
        ...heads.map(widthSample),
        tbody(
          [...samples].sort((a, b) => a - b).map((i) => widthSample(rows[i])),
        ),
      ]),
    ),
  );
  // Do not separate cells whose rowspan crosses the next row.
  const units = [];
  let unit = [],
    remaining = 0;
  for (const row of rows) {
    unit.push(row);
    remaining = Math.max(
      remaining - 1,
      ...row.children
        .filter(tag)
        .map((cell) => Number(cell.attribs.rowspan || 1) - 1),
      0,
    );
    if (!remaining) {
      units.push(unit);
      unit = [];
    }
  }
  if (unit.length) units.push(unit);
  const groups = pack(
    units,
    (x) => x.reduce((sum, row) => sum + content.size(row), 0),
    (x) => x.length,
  ).map((x) => x.flat());
  return groups.map((group, index) => {
    const part = clone(
      node,
      [
        ...(index ? [] : heads),
        tbody(group),
        ...(index === groups.length - 1 ? feet : []),
      ],
      index > 0,
      index < groups.length - 1,
    );
    part.attribs["data-pmp-table"] = tableId;
    return part;
  });
}
function splitNode(node, tables, content) {
  if (!tag(node) || content.size(node) <= CHUNK_BYTES) return [node];
  if (node.name === "table") return splitTable(node, tables, content);
  const isList = node.name === "ul" || node.name === "ol";
  if (
    !isList &&
    !["blockquote", "div", "section", "article"].includes(node.name)
  )
    return [node];
  const children = (node.children || []).flatMap((child) =>
    splitNode(child, tables, content),
  );
  const groups = pack(children, content.size, anchorCount);
  let start = Number(node.attribs?.start || 1);
  const step = Object.hasOwn(node.attribs || {}, "reversed") ? -1 : 1;
  if (step < 0 && !node.attribs.start)
    start = children.filter((x) => x.name === "li").length;
  return groups.map((group, index) => {
    const part = clone(node, group, index > 0, index < groups.length - 1);
    if (node.name === "ol") {
      part.attribs.start = String(start);
      for (const item of group)
        if (item.name === "li")
          start = Number(item.attribs.value ?? start) + step;
    }
    return part;
  });
}
function units(text) {
  const wide = (text.match(/[^\x00-\xff]/g) || []).length;
  return (text.length - wide) * 0.55 + wide;
}
function indexChunk(nodes, content) {
  let text = "";
  const anchors = [],
    ids = [];
  function visit(node) {
    if (node.type === "text") {
      text += content.text(node.data);
      return;
    }
    if (node.attribs?.class?.includes("inkpage-katex-mathml")) return;
    const attrs = node.attribs || {};
    if (attrs.id) ids.push(attrs.id);
    let anchor;
    if (attrs["data-pmp-line"] !== undefined) {
      anchor = {
        line: Number(attrs["data-pmp-line"]),
        end: Number(attrs["data-pmp-end"]),
        offset: text.length,
        kind: node.name,
      };
      anchors.push(anchor);
    }
    for (const child of node.children || []) visit(child);
    if (anchor) anchor.units = units(text.slice(anchor.offset));
  }
  for (const node of nodes) visit(node);
  return { text, anchors, ids };
}
function renderLargeDocument(source, options = {}) {
  const started = performance.now();
  const renderer = createRenderer({
    ...options,
    commonPlugins: options.theme !== "default",
  });
  const front = renderFrontMatter(source, options.frontMatter);
  const offset = (
    source.slice(0, source.length - front.source.length).match(/\n/g) || []
  ).length;
  const mathText = new Map(),
    plainMath = new Map(),
    sizes = new WeakMap();
  const env = {
    inkpageTrusted: new Map(),
    inkpageDeferMath: true,
    inkpageLineOffset: offset,
    inkpageIndexMath(key, result, number) {
      if (!plainMath.has(result))
        plainMath.set(result, textOf(parseDocument(result)));
      mathText.set(key, plainMath.get(result) + (number ? `(${number})` : ""));
    },
  };
  const content = {
    text: (value) =>
      value.replace(
        /INKPAGEMATH[0-9a-f]{40}/g,
        (key) => mathText.get(key) ?? key,
      ),
    size(node) {
      if (!sizes.has(node)) {
        const value = html(node);
        let bytes = value.length;
        for (const match of value.matchAll(/INKPAGEMATH[0-9a-f]{40}/g))
          bytes +=
            (env.inkpageTrusted.get(match[0])?.length ?? match[0].length) -
            match[0].length;
        sizes.set(node, bytes);
      }
      return sizes.get(node);
    },
  };
  const tokens = renderer.parse(front.source, env);
  const blocks = Object.create(null);
  let key = 0;
  const wrapped = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.map || token.type === "inline" || token.hidden) continue;
    const mapped =
      /^(?:heading_open|paragraph_open|tr_open|fence|code_block|html_block)$/.test(
        token.type,
      ) ||
      token.type.startsWith("inkpage_") ||
      (token.type === "list_item_open" && tokens[i + 1]?.hidden);
    if (!mapped) continue;
    token.attrSet("data-pmp-line", String(token.map[0] + offset));
    token.attrSet("data-pmp-end", String(token.map[1] + offset));
    const blockKey = String(key++);
    token.attrSet("data-pmp-key", blockKey);
    token.attrSet("data-pmp-kind", token.type);
    blocks[blockKey] = {
      line: token.map[0] + offset,
      end: token.map[1] + offset,
      kind: token.type,
    };
    if (token.nesting === 1) token.attrSet("dir", "auto");
    else if (!wrapped.has(token.type)) {
      const original = renderer.renderer.rules[token.type];
      renderer.renderer.rules[token.type] = (ts, index, opts, state, self) => {
        const t = ts[index];
        return `<div data-pmp-line="${t.map[0] + offset}" data-pmp-end="${t.map[1] + offset}" data-pmp-key="${t.attrGet("data-pmp-key")}" data-pmp-kind="${t.type}">${original(ts, index, opts, state, self)}</div>`;
      };
      wrapped.add(token.type);
    }
  }
  const rendered = sanitizeRenderedHtml(
    front.html + renderer.renderer.render(tokens, renderer.options, env),
    true,
  );
  // Math stays opaque while splitting and indexing. Expanding every formula
  // here can turn a small source file into millions of offscreen DOM nodes.
  const tree = parseDocument(rendered);
  const tables = [];
  // URLs are resolved by the host using the actual document URI.
  if (options.assetUri)
    walk(tree, (node) => {
      if (node.name === "img" && node.attribs.src) {
        node.attribs.src = options.assetUri(node.attribs.src);
        node.attribs.loading = "lazy";
      }
    });
  const pieces = tree.children.flatMap((node) =>
    splitNode(node, tables, content),
  );
  const groups = pack(pieces, content.size, anchorCount);
  const chunks = groups.map((nodes) => {
    const compact = html(nodes);
    let expanded;
    return {
      get html() {
        return (expanded ??= restoreMath(compact, env));
      },
      ...indexChunk(nodes, content),
    };
  });
  let previousLine = 0;
  for (const chunk of chunks) {
    chunk.line = chunk.anchors[0]?.line ?? previousLine;
    previousLine = chunk.anchors.at(-1)?.line ?? previousLine;
  }
  const headings = [],
    idChunks = Object.create(null),
    sourceAnchors = [];
  chunks.forEach((chunk, index) => {
    for (const id of chunk.ids) idChunks[id] ??= index;
    for (const anchor of chunk.anchors)
      sourceAnchors.push({ line: anchor.line, chunk: index });
    walk({ children: groups[index] }, (node) => {
      if (/^h[1-6]$/.test(node.name))
        headings.push({
          text: textOf(node, content),
          level: Number(node.name[1]),
          id: node.attribs.id,
          line: Number(node.attribs["data-pmp-line"] || 0),
        });
    });
  });
  sourceAnchors.sort((a, b) => a.line - b.line);
  return {
    chunks,
    tables,
    headings,
    idChunks,
    sourceAnchors,
    blocks,
    lineCount: (source.match(/\n/g) || []).length + 1,
    renderMs: Math.round(performance.now() - started),
  };
}
function chunkAtLine(model, line) {
  const anchors = model.sourceAnchors;
  let lo = 0,
    hi = anchors.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (anchors[mid].line <= line) lo = mid + 1;
    else hi = mid;
  }
  return anchors[Math.max(0, lo - 1)]?.chunk || 0;
}
class DocumentSearch {
  constructor(model, query) {
    this.model = model;
    this.query = query;
    this.pattern = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "giu",
    );
    this.counts = model.chunks.map((chunk) => {
      let count = 0;
      if (query) for (const _ of chunk.text.matchAll(this.pattern)) count++;
      return count;
    });
    this.total = this.counts.reduce((a, b) => a + b, 0);
  }
  at(index) {
    if (!this.total) return { total: 0, index: 0 };
    index = ((index % this.total) + this.total) % this.total;
    let chunk = 0,
      local = index;
    while (local >= this.counts[chunk]) local -= this.counts[chunk++];
    const data = this.model.chunks[chunk];
    for (const match of data.text.matchAll(this.pattern))
      if (local-- === 0) {
        let line = data.line;
        for (const anchor of data.anchors)
          if (anchor.offset <= match.index) line = anchor.line;
        return {
          total: this.total,
          index,
          chunk,
          start: match.index,
          length: match[0].length,
          line,
        };
      }
  }
}
function lineAfterChanges(line, changes) {
  for (const change of [...changes].sort(
    (a, b) => b.range.start.line - a.range.start.line,
  )) {
    const start = change.range.start.line,
      end = change.range.end.line;
    const added = (change.text.match(/\n/g) || []).length;
    if (line >= end) line += added - (end - start);
    else if (line >= start) line = start + Math.min(line - start, added);
  }
  return Math.max(0, line);
}
module.exports = {
  renderLargeDocument,
  chunkAtLine,
  DocumentSearch,
  lineAfterChanges,
};
