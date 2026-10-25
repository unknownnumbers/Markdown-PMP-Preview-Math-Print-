"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { Parser } = require("htmlparser2");
const {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFHexString,
  rgb,
} = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { checkAbort } = require("./render.cjs");
const { t } = require("./i18n.cjs");

const PDF_PART_SIZE = 1_000_000;
const ANCHOR_URI = "https://markdown-pmp.invalid/destination/";
function anchorId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function preparePartLinks(html) {
  const ids = new Set(),
    edits = [];
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (attributes.id) ids.add(attributes.id);
        if (name !== "a" || !attributes.href?.startsWith("#")) return;
        const start = parser.startIndex,
          end = parser.endIndex + 1;
        const tag = html
          .slice(start, end)
          .replace(
            /\bhref="[^"]*"/,
            `href="${ANCHOR_URI}${encodeURIComponent(anchorId(attributes.href.slice(1)))}"`,
          );
        edits.push({ start, end, tag });
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  let result = "",
    offset = 0;
  for (const edit of edits) {
    result += html.slice(offset, edit.start) + edit.tag;
    offset = edit.end;
  }
  result += html.slice(offset);
  const escape = (value) =>
    value.replace(
      /[&"<>]/g,
      (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c],
    );
  const probes = `<div style="position:fixed;top:0;left:0;font-size:1px;line-height:1px;opacity:0">${[...ids].map((id) => `<a href="#${escape(id)}">.</a>`).join("")}</div>`;
  const end = result.lastIndexOf("</main>");
  return result.slice(0, end) + probes + result.slice(end);
}
function splitPdfHtml(html, limit = PDF_PART_SIZE) {
  const main = html.indexOf('<main class="markdown-body"');
  if (main < 0) return [html];
  const start = html.indexOf(">", main) + 1;
  const end = html.lastIndexOf("</main>");
  const body = html.slice(start, end);
  if (body.length <= limit) return [html];
  const units = [];
  const stack = [];
  let current,
    rowStart,
    cursor = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (!stack.length)
          current = { name, start: parser.startIndex, rows: [] };
        if (
          current?.name === "table" &&
          name === "tr" &&
          stack.at(-1) === "tbody"
        )
          rowStart = parser.startIndex;
        stack.push(name);
      },
      onclosetag(name) {
        const finish = parser.endIndex + 1;
        if (
          name === "tr" &&
          stack.at(-2) === "tbody" &&
          rowStart !== undefined
        ) {
          current.rows.push({ start: rowStart, end: finish });
          rowStart = undefined;
        }
        stack.pop();
        if (stack.length || !current) return;
        const rows = current.rows;
        if (
          current.name === "table" &&
          finish - cursor > limit &&
          rows.length > 1
        ) {
          const before = body.slice(cursor, rows[0].start);
          const after = body.slice(rows.at(-1).end, finish);
          let first = 0;
          for (let i = 1; i <= rows.length; i++) {
            if (
              i < rows.length &&
              rows[i].end - rows[first].start + before.length + after.length <=
                limit
            )
              continue;
            units.push({
              html:
                before + body.slice(rows[first].start, rows[i - 1].end) + after,
            });
            first = i;
          }
        } else
          units.push({
            html: body.slice(cursor, finish),
            heading: /^h[1-6]$/.test(current.name),
          });
        cursor = finish;
        current = undefined;
      },
    },
    { decodeEntities: false, recognizeSelfClosing: true },
  );
  parser.end(body);
  if (cursor < body.length) units.push({ html: body.slice(cursor) });
  const parts = [];
  let content = "",
    heading = false;
  for (const unit of units) {
    if (content && content.length + unit.html.length > limit && !heading) {
      parts.push(html.slice(0, start) + content + html.slice(end));
      content = "";
    }
    content += unit.html;
    heading = Boolean(unit.heading);
  }
  if (content) parts.push(html.slice(0, start) + content + html.slice(end));
  return parts.length > 1 ? parts : [html];
}

async function pdfPageCount(bytes) {
  return (await PDFDocument.load(bytes)).getPageCount();
}
function destination(doc, value, pages) {
  const dest = doc.context.lookup(value);
  if (!(dest instanceof PDFArray)) return;
  const index = pages.findIndex(
    (page) => page.ref.toString() === dest.get(0)?.toString(),
  );
  if (index < 0) return;
  return { index, params: dest.asArray().slice(1) };
}
function namedDestinations(doc, pages) {
  const result = new Map();
  function add(name, value) {
    const object = doc.context.lookup(value);
    const target = destination(
      doc,
      object instanceof PDFDict ? object.get(PDFName.of("D")) : object,
      pages,
    );
    if (target) result.set(anchorId(name.decodeText()), target);
  }
  const direct = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
  if (direct) for (const name of direct.keys()) add(name, direct.get(name));
  const names = doc.catalog
    .lookupMaybe(PDFName.of("Names"), PDFDict)
    ?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  function walk(node) {
    const entries = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (entries)
      for (let i = 0; i < entries.size(); i += 2)
        add(entries.lookup(i), entries.get(i + 1));
    const children = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (children)
      for (let i = 0; i < children.size(); i++)
        walk(children.lookup(i, PDFDict));
  }
  if (names) walk(names);
  return result;
}
function outlines(doc, pages, offset) {
  const root = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
  function read(first) {
    const result = [];
    for (let ref = first; ref;) {
      const item = doc.context.lookup(ref, PDFDict);
      const action = item.lookupMaybe(PDFName.of("A"), PDFDict);
      const target = destination(
        doc,
        item.get(PDFName.of("Dest")) || action?.get(PDFName.of("D")),
        pages,
      );
      result.push({
        title: item.lookup(PDFName.of("Title")).decodeText(),
        target: target && {
          index: offset + target.index,
          params: target.params,
        },
        children: read(item.get(PDFName.of("First"))),
      });
      ref = item.get(PDFName.of("Next"));
    }
    return result;
  }
  return root ? read(root.get(PDFName.of("First"))) : [];
}
function writeOutlines(doc, items, pageMap) {
  function select(list) {
    return list.flatMap((item) => {
      const children = select(item.children);
      const target = pageMap.has(item.target?.index)
        ? item.target
        : children[0]?.target;
      return target ? [{ ...item, target, children }] : [];
    });
  }
  const selected = select(items);
  if (!selected.length) return;
  const root = doc.context.nextRef();
  function write(list, parent) {
    const refs = list.map(() => doc.context.nextRef());
    let count = 0;
    list.forEach((item, i) => {
      const children = write(item.children, refs[i]);
      const dict = doc.context.obj({
        Title: PDFHexString.fromText(item.title),
        Parent: parent,
        Dest: [pageMap.get(item.target.index).ref, ...item.target.params],
      });
      if (i) dict.set(PDFName.of("Prev"), refs[i - 1]);
      if (i + 1 < refs.length) dict.set(PDFName.of("Next"), refs[i + 1]);
      if (children.count) {
        dict.set(PDFName.of("First"), children.first);
        dict.set(PDFName.of("Last"), children.last);
        dict.set(PDFName.of("Count"), doc.context.obj(children.count));
      }
      doc.context.assign(refs[i], dict);
      count += 1 + children.count;
    });
    return { first: refs[0], last: refs.at(-1), count };
  }
  const result = write(selected, root);
  doc.context.assign(
    root,
    doc.context.obj({
      Type: "Outlines",
      First: result.first,
      Last: result.last,
      Count: result.count,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), root);
}
function selectedPages(ranges, total) {
  if (!ranges) return new Set(Array.from({ length: total }, (_, i) => i));
  const pages = new Set();
  for (const part of ranges.split(",")) {
    const [start, end = start] = part.trim().split("-").map(Number);
    for (let i = start; i <= Math.min(end, total); i++) pages.add(i - 1);
  }
  if (!pages.size)
    throw new Error(t("The selected page range contains no pages."));
  return pages;
}
function color(value) {
  const hex = String(value || "#666666").replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex))
    return rgb(...[...hex].map((x) => parseInt(x + x, 16) / 255));
  if (/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(hex))
    return rgb(
      ...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
    );
  const numbers = String(value)
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  return numbers?.length === 3
    ? rgb(...numbers.map((x) => x / 255))
    : rgb(0.4, 0.4, 0.4);
}
async function mergePdfParts(parts, settings, input) {
  const total = parts.reduce((n, part) => n + part.pages, 0);
  const wanted = selectedPages(settings.pageRanges, total);
  const output = await PDFDocument.create();
  const pageMap = new Map(),
    targets = new Map(),
    links = [],
    headings = [];
  let offset = 0;
  for (const part of parts) {
    checkAbort(input.signal);
    const indices = Array.from({ length: part.pages }, (_, i) => i).filter(
      (i) => wanted.has(offset + i),
    );
    if (indices.length) {
      const source = await PDFDocument.load(await fs.readFile(part.filename));
      const pages = source.getPages();
      for (const [id, target] of namedDestinations(source, pages))
        if (!targets.has(id))
          targets.set(id, {
            index: offset + target.index,
            params: target.params,
          });
      headings.push(...outlines(source, pages, offset));
      const imported = await output.copyPages(source, indices);
      imported.forEach((page, i) => {
        output.addPage(page);
        pageMap.set(offset + indices[i], page);
        const original = pages[indices[i]].node.Annots();
        const copied = page.node.Annots();
        const probes = [];
        for (let n = 0; n < (original?.size() || 0); n++) {
          const originalLink = original.lookup(n, PDFDict);
          copied.lookup(n, PDFDict).delete(PDFName.of("StructParent"));
          const action = originalLink.lookupMaybe(PDFName.of("A"), PDFDict);
          const uri = action
            ?.lookupMaybe(PDFName.of("URI"), PDFString, PDFHexString)
            ?.decodeText();
          if (uri?.startsWith(ANCHOR_URI)) {
            links.push({
              annotation: copied.lookup(n, PDFDict),
              id: anchorId(uri.slice(ANCHOR_URI.length)),
            });
            continue;
          }
          if (
            originalLink.has(PDFName.of("Dest")) ||
            action?.has(PDFName.of("D"))
          ) {
            probes.push(n);
            continue;
          }
        }
        for (const n of probes.reverse()) copied.remove(n);
        page.node.delete(PDFName.of("StructParents"));
      });
    }
    offset += part.pages;
  }
  for (const { annotation, id } of links) {
    const target = targets.get(id);
    const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
    action?.delete(PDFName.of("URI"));
    annotation.delete(PDFName.of("A"));
    if (target && pageMap.has(target.index))
      annotation.set(
        PDFName.of("Dest"),
        output.context.obj([pageMap.get(target.index).ref, ...target.params]),
      );
    else annotation.delete(PDFName.of("Dest"));
  }
  writeOutlines(output, headings, pageMap);
  if (settings.header.length || settings.footer.length) {
    const title = input.title || "Markdown";
    const unicode =
      [...settings.header, ...settings.footer].includes("filename") &&
      /[^\x00-\x7f]/.test(title);
    const fontPath = path.join(
      input.extensionPath || path.resolve(__dirname, ".."),
      "assets/fonts",
      unicode ? "LXGWWenKaiGB-Regular.ttf" : "Inconsolata-Regular.ttf",
    );
    output.registerFontkit(fontkit);
    const font = await output.embedFont(await fs.readFile(fontPath), {
      subset: true,
    });
    const date = new Date().toLocaleDateString("sv-SE");
    for (const [index, page] of pageMap) {
      for (const [fields, top] of [
        [settings.header, true],
        [settings.footer, false],
      ]) {
        if (!fields.length) continue;
        const text = fields
          .map((field) =>
            field === "filename"
              ? title
              : field === "date"
                ? date
                : `${index + 1} / ${total}`,
          )
          .join(" - ");
        const { width, height } = page.getSize();
        const size = Math.min(
          6.75,
          (width - 40) / font.widthOfTextAtSize(text, 1),
        );
        const zone =
          ((top ? settings.margins.top : settings.margins.bottom) * 72) / 25.4;
        page.drawText(text, {
          font,
          size,
          color: color(input.foreground),
          x: (width - font.widthOfTextAtSize(text, size)) / 2,
          y: top ? height - zone / 2 - size / 2 : zone / 2 - size / 2,
        });
      }
    }
  }
  output.setTitle(input.title || "Markdown");
  output.setCreator("Markdown PMP");
  output.setProducer("Markdown PMP");
  checkAbort(input.signal);
  return Buffer.from(await output.save());
}
module.exports = {
  splitPdfHtml,
  preparePartLinks,
  pdfPageCount,
  mergePdfParts,
  selectedPages,
};
