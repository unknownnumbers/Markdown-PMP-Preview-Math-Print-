"use strict";
const { t, getLanguage } = require("./i18n.cjs");

const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const MarkdownIt = require("markdown-it");
const highlight = require("highlight.js");
const footnote = require("markdown-it-footnote");
const taskLists = require("markdown-it-task-lists");
const yaml = require("js-yaml");
const sanitizeHtml = require("sanitize-html");
const { parseDocument } = require("htmlparser2");
const serialize = require("dom-serializer").default;
const {
  loadStyles,
  loadMathStyles,
  loadNativeStyles,
  normalizeOptions,
  variableCss,
} = require("./theme.cjs");
const { installMath, mathErrors, restoreMath } = require("./math.cjs");

const PLUGINS = Symbol.for("inkpage.markdown.plugins");
function commonPlugins(md) {
  if (!md[PLUGINS]) {
    md.use(footnote).use(taskLists, { enabled: false });
    md[PLUGINS] = true;
  }
  return md;
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

function createRenderer(options = {}) {
  const aliases = {
    shell: "sh",
    py3: "python",
    tsx: "jsx",
    typescriptreact: "jsx",
    json5: "json",
    jsonc: "json",
    "c#": "cs",
    csharp: "cs",
  };
  const md = new MarkdownIt({
    html: true,
    linkify: options.linkify !== false,
    breaks: Boolean(options.breaks),
    typographer: Boolean(options.typographer),
    highlight: (source, language) => {
      const name = aliases[language?.toLowerCase()] || language?.toLowerCase();
      if (name && highlight.getLanguage(name)) {
        try {
          return highlight.highlight(source, {
            language: name,
            ignoreIllegals: true,
          }).value;
        } catch {
          /* Plain code remains readable. */
        }
      }
      return escapeHtml(source);
    },
  });
  if (options.commonPlugins !== false) commonPlugins(md);
  md.linkify.set({ fuzzyLink: false });
  installMath(md, () => options.math || { enabled: false });
  const originalHeading = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, index, opts, env, self) => {
    const text = (tokens[index + 1]?.children || [])
      .filter((x) => ["text", "code_inline", "emoji"].includes(x.type))
      .map((x) => x.content)
      .join("");
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    env.headingIds ||= new Set();
    let slug = base;
    let suffix = 0;
    while (env.headingIds.has(slug)) slug = `${base}-${++suffix}`;
    env.headingIds.add(slug);
    tokens[index].attrSet("id", slug);
    return originalHeading
      ? originalHeading(tokens, index, opts, env, self)
      : self.renderToken(tokens, index, opts);
  };
  return md;
}

function renderFrontMatter(source, mode = "table") {
  const match =
    /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(source);
  if (!match) return { source, html: "" };
  const remaining = source.slice(match[0].length);
  if (mode === "hide") return { source: remaining, html: "" };
  if (mode === "codeBlock")
    return {
      source: remaining,
      html: `<pre class="frontmatter"><code>${escapeHtml(match[1])}</code></pre>\n`,
    };
  try {
    const data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const rows = Object.entries(data)
        .map(
          ([key, value]) =>
            `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : (value ?? ""))}</td></tr>`,
        )
        .join("");
      return {
        source: remaining,
        html: `<table class="frontmatter"><tbody>${rows}</tbody></table>\n`,
      };
    }
  } catch {
    /* Invalid or recursive YAML is shown literally rather than discarded. */
  }
  return {
    source: remaining,
    html: `<pre class="frontmatter"><code>${escapeHtml(match[1])}</code></pre>\n`,
  };
}

function sanitizeRenderedHtml(html, preview = false) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "input",
      "details",
      "summary",
      "figure",
      "figcaption",
      "mark",
      "kbd",
      "s",
      "del",
    ],
    allowedAttributes: {
      "*": [
        "class",
        "id",
        "title",
        "dir",
        "role",
        "aria-label",
        "aria-hidden",
        ...(preview
          ? ["data-pmp-line", "data-pmp-end", "data-pmp-key", "data-pmp-kind"]
          : []),
      ],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      input: ["type", "checked", "disabled", "class"],
      ol: ["start", "reversed", "type"],
      li: ["value", "class"],
      th: ["colspan", "rowspan", "scope", "style"],
      td: ["colspan", "rowspan", "style"],
      details: ["open"],
    },
    allowedStyles: { "*": { "text-align": [/^(?:left|right|center)$/] } },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "file", "data", "vscode-remote"],
      a: ["http", "https", "mailto", "tel", "file"],
    },
    allowProtocolRelative: true,
    transformTags: {
      a: (name, attrs) => ({
        tagName: name,
        attribs: {
          ...attrs,
          ...(attrs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
        },
      }),
      input: (name, attrs) => ({
        tagName: name,
        attribs: {
          type: "checkbox",
          disabled: "disabled",
          ...(Object.hasOwn(attrs, "checked") ? { checked: "checked" } : {}),
          class: "task-list-item-checkbox",
        },
      }),
    },
  });
}

function assetUrl(value, sourceUri, workspaceRoot) {
  if (/^[A-Za-z]:[\\/]/.test(value))
    return pathToFileURL(value.replace(/\\/g, "/")).href;
  if (/^\/\//.test(value)) return "https:" + value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return new URL(value).href;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") && workspaceRoot)
    return new URL(
      normalized.replace(/^\/+/, ""),
      workspaceRoot.replace(/\/?$/, "/"),
    ).href;
  return new URL(normalized, sourceUri).href;
}

function imageMime(bytes, filename) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (bytes.subarray(0, 2).toString() === "BM") return "image/bmp";
  if (
    bytes.subarray(4, 8).toString() === "ftyp" &&
    /avif|avis/.test(bytes.subarray(8, 32).toString())
  )
    return "image/avif";
  if (
    /\.svg$/i.test(filename) &&
    /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(
      bytes.toString("utf8"),
    )
  )
    return "image/svg+xml";
  throw new Error(t("Unsupported image file: {0}", filename));
}

function abortError() {
  return Object.assign(new Error(t("Export cancelled.")), {
    name: "AbortError",
  });
}
function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}

async function embedImages(html, input) {
  const doc = parseDocument(html, { decodeEntities: true });
  const warnings = new Set();
  const cache = new Map();
  async function embed(src) {
    checkAbort(input.signal);
    if (
      /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|svg\+xml);base64,/i.test(src)
    )
      return src;
    const absolute = assetUrl(src, input.sourceUri, input.workspaceRoot);
    const uri = new URL(absolute);
    if (uri.protocol === "http:" || uri.protocol === "https:") {
      warnings.add(
        t(
          "Remote images keep their original URLs. Download them locally for offline reading.",
        ),
      );
      return absolute;
    }
    if (!["file:", "vscode-remote:"].includes(uri.protocol))
      throw new Error(t("Unsupported image URL: {0}", src));
    const fragment = uri.hash;
    uri.hash = "";
    uri.search = "";
    const key = uri.href;
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          let bytes;
          try {
            bytes = Buffer.from(await input.readAsset(uri.href));
          } catch (error) {
            throw new Error(
              t('Could not read local image "{0}": {1}', src, error.message),
            );
          }
          checkAbort(input.signal);
          if (bytes.length > 25 * 1024 * 1024)
            throw new Error(
              t('Image "{0}" exceeds 25 MB. Resize it before exporting.', src),
            );
          return `data:${imageMime(bytes, decodeURIComponent(uri.pathname))};base64,${bytes.toString("base64")}`;
        })(),
      );
    }
    return (await cache.get(key)) + fragment;
  }
  async function visit(node) {
    checkAbort(input.signal);
    if (node.type === "tag" && node.name === "img" && node.attribs.src)
      node.attribs.src = await embed(node.attribs.src);
    if (
      node.type === "tag" &&
      node.name === "a" &&
      node.attribs.href &&
      !/^(?:#|[a-z][a-z\d+.-]*:|\/\/)/i.test(node.attribs.href)
    ) {
      const absolute = assetUrl(
        node.attribs.href,
        input.sourceUri,
        input.workspaceRoot,
      );
      // Keep references relative when both files are local, even if the export is saved elsewhere.
      if (input.outputPath && absolute.startsWith("file:")) {
        const { fileURLToPath } = require("node:url");
        const resolved = new URL(absolute);
        const relative = path
          .relative(path.dirname(input.outputPath), fileURLToPath(resolved))
          .split(path.sep)
          .map(encodeURIComponent)
          .join("/");
        node.attribs.href = relative + resolved.search + resolved.hash;
      } else node.attribs.href = absolute;
    }
    for (const child of node.children || []) await visit(child);
  }
  await visit(doc);
  return {
    html: serialize(doc, { encodeEntities: "utf8" }),
    warnings: [...warnings],
  };
}

async function renderDocument(input) {
  checkAbort(input.signal);
  const options = normalizeOptions(input.options);
  const renderer = createRenderer(input.markdownOptions);
  const front = renderFrontMatter(
    input.markdown,
    input.markdownOptions?.frontMatter,
  );
  const env = {
    inkpageTrusted: new Map(),
    inkpageLineOffset: (
      input.markdown
        .slice(0, input.markdown.length - front.source.length)
        .match(/\n/g) || []
    ).length,
  };
  let rendered = sanitizeRenderedHtml(
    front.html + renderer.render(front.source, env),
  );
  mathErrors(env);
  rendered = restoreMath(rendered, env);
  const embedded = await embedImages(rendered, {
    ...input,
    readAsset: input.readAsset || ((uri) => fs.readFile(new URL(uri))),
  });
  const styles =
    (options.theme === "default"
      ? await loadNativeStyles(input.extensionPath, input.snapshot)
      : await loadStyles(input.extensionPath, input.fontMode || "embedded")) +
    (input.markdownOptions?.math?.enabled === false
      ? ""
      : await loadMathStyles(
          input.extensionPath,
          input.fontMode || "embedded",
        ));
  checkAbort(input.signal);
  const fontSchemes = input.fontMode === "file" ? "data: file:" : "data:";
  const csp = `default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src ${fontSchemes}; base-uri 'none'; form-action 'none'`;
  return {
    html: `<!DOCTYPE html>\n<html lang="${escapeHtml(getLanguage())}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="generator" content="Markdown PMP 1.0.0"><title>${escapeHtml(input.title || "Markdown")}</title><style>${styles}\n${variableCss(options)}\n${input.layoutCss || ""}</style></head><body class="inkpage-export ${input.snapshot?.kind || "vscode-light"}"><main class="markdown-body" dir="auto">${embedded.html}</main></body></html>\n`,
    warnings: embedded.warnings,
  };
}

module.exports = {
  createRenderer,
  commonPlugins,
  renderDocument,
  renderFrontMatter,
  sanitizeRenderedHtml,
  embedImages,
  assetUrl,
  imageMime,
  escapeHtml,
  abortError,
  checkAbort,
};
