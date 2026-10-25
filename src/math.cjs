"use strict";
const { t } = require("./i18n.cjs");

const crypto = require("node:crypto");
const katex = require("katex");
const texmath = require("markdown-it-texmath");
const MODES = ["dollars", "brackets", "gitlab", "julia", "kramdown"];
const INSTALLED = Symbol("inkpage.math");
const mathClasses = (html) =>
  html.replace(
    /class="([^"]*)"/g,
    (_, classes) =>
      `class="${classes
        .split(/\s+/)
        .map((c) => c.replace(/^katex/, "inkpage-katex"))
        .join(" ")}"`,
  );
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function normalizeMath(input = {}) {
  if (input.enabled === false)
    return {
      enabled: false,
      delimiters: ["dollars", "brackets"],
      macros: {},
      outerspace: false,
      fallbackToCode: input.fallbackToCode !== false,
    };
  const delimiters = [
    ...new Set(
      typeof input.delimiters === "string"
        ? [input.delimiters]
        : input.delimiters || ["dollars", "brackets"],
    ),
  ];
  if (!delimiters.length || delimiters.some((x) => !MODES.includes(x)))
    throw new Error(
      t(
        "Math delimiters must be a nonempty array of dollars, brackets, gitlab, julia or kramdown.",
      ),
    );
  for (const pair of [
    ["dollars", "kramdown"],
    ["gitlab", "julia"],
  ])
    if (pair.every((x) => delimiters.includes(x)))
      throw new Error(
        t("Math modes {0} overlap. Select them separately.", pair.join(" + ")),
      );
  const macros = input.macros || {};
  if (
    typeof macros !== "object" ||
    Array.isArray(macros) ||
    Object.values(macros).some((x) => typeof x !== "string")
  )
    throw new Error(
      t("Math macros must map command names to formula strings."),
    );
  return {
    enabled: input.enabled !== false,
    delimiters,
    macros: { ...macros },
    outerspace: Boolean(input.outerspace),
    fallbackToCode: input.fallbackToCode !== false,
  };
}

function installMath(md, getConfig) {
  if (md[INSTALLED]) return;
  md[INSTALLED] = true;
  const config = () => normalizeMath(getConfig());
  const parsers = { inline: {}, block: {} };
  function render(tokens, index, options, env = {}) {
    const token = tokens[index],
      cfg = config();
    if (!env.inkpageMacros) {
      env.inkpageMathCache = new Map();
      env.inkpageMathRevision = 0;
      env.inkpageMacros = new Proxy(
        { ...cfg.macros },
        {
          set(target, name, value) {
            target[name] = value;
            env.inkpageMathRevision++;
            env.inkpageMathCache.clear();
            return true;
          },
          deleteProperty(target, name) {
            delete target[name];
            env.inkpageMathRevision++;
            env.inkpageMathCache.clear();
            return true;
          },
        },
      );
    }
    const line =
      (token.map?.[0] ?? token.meta?.inkpageLine ?? 0) +
      1 +
      (env.inkpageLineOffset || 0);
    const rawSource =
      token.meta?.inkpageSource ||
      (token.meta?.inkpageOpen || token.markup || "") +
        token.content +
        (token.meta?.inkpageClose || token.markup || "") +
        (token.info ? ` (${token.info})` : "");
    let result, entry, fallback;
    try {
      const key = `${Boolean(token.meta?.inkpageDisplay)}:${token.content}`;
      entry = env.inkpageMathCache.get(key);
      if (entry === undefined) {
        const revision = env.inkpageMathRevision;
        const deferred = Boolean(env.inkpageDeferMath && env.inkpageTrusted);
        const macros = deferred ? { ...env.inkpageMacros } : undefined;
        const katexOptions = {
          displayMode: token.meta?.inkpageDisplay,
          macros: env.inkpageMacros,
          throwOnError: true,
          strict: "warn",
          trust: false,
          maxExpand: 1000,
          output: deferred ? "mathml" : "htmlAndMathml",
        };
        entry = {
          result: mathClasses(
            katex.renderToString(token.content, katexOptions),
          ),
        };
        if (deferred) {
          let expanded;
          // MathML validates syntax and applies definitions in source order.
          // The larger visual HTML is needed only when this formula is shown.
          entry.expand = () =>
            (expanded ??= mathClasses(
              katex.renderToString(token.content, {
                ...katexOptions,
                macros: { ...macros },
                output: "htmlAndMathml",
              }),
            ));
        }
        // Definitions can change later formulas. Cache only a render that did
        // not mutate the document's macro namespace.
        if (revision === env.inkpageMathRevision)
          env.inkpageMathCache.set(key, entry);
      }
      result = entry.result;
    } catch (error) {
      (env.inkpageMathErrors ||= []).push({
        line,
        message: error.message,
        source: token.content,
        fallbackToCode: cfg.fallbackToCode,
      });
      if (cfg.fallbackToCode) {
        const code = `<code class="inkpage-math-fallback" data-inkpage-line="${line}" title="${escape(error.message)}">${escape(rawSource)}</code>`;
        fallback = token.meta?.inkpageDisplay
          ? `<pre class="inkpage-math-fallback">${code}</pre>`
          : code;
        result = fallback;
      } else {
        result = `<code class="inkpage-math-error" title="${escape(error.message)}">${escape(token.meta?.inkpageOpen || token.markup || "")}${escape(token.content)}${escape(token.meta?.inkpageClose || token.markup || "")}</code><span class="inkpage-math-error-message">${escape(t("Math error - line {0}: {1}", line, error.message))}</span>`;
      }
    }
    const tag = token.block ? "div" : "span";
    const number = token.info
      ? `<span class="inkpage-equation-number">(${escape(token.info)})</span>`
      : "";
    const sourceAttribute = cfg.fallbackToCode
      ? ` data-inkpage-source="${escape(rawSource)}"`
      : "";
    const before = `<${tag} class="inkpage-math${token.meta?.inkpageDisplay ? " inkpage-math-display" : ""}" data-inkpage-line="${line}"${sourceAttribute}><span class="inkpage-equation-content">`;
    const after = `</span>${number}</${tag}>`;
    const html =
      fallback ||
      (entry?.expand
        ? {
            length: before.length + result.length * 6 + after.length,
            toString: () => before + entry.expand() + after,
          }
        : before + result + after);
    if (env.inkpageTrusted) {
      const key = "INKPAGEMATH" + crypto.randomBytes(20).toString("hex");
      env.inkpageTrusted.set(key, html);
      env.inkpageIndexMath?.(key, result, fallback ? "" : token.info);
      return key;
    }
    return String(html);
  }
  for (const mode of MODES)
    for (const kind of ["inline", "block"])
      for (const [i, template] of texmath.rules[mode][kind].entries()) {
        const name = `inkpage_${mode}_${kind}_${i}`;
        const rule = {
          ...template,
          name,
          rex: new RegExp(template.rex.source, template.rex.flags),
        };
        if (
          kind === "inline" &&
          template.tag === "$" &&
          ["dollars", "julia"].includes(mode)
        )
          rule.rex = /\$(?!\s*\$)((?:\\[^\r\n]|[^\\$\r\n])+?)\$/gy;
        const parser =
          kind === "inline" ? texmath.inline(rule) : texmath.block(rule);
        const wrapped = (state, ...args) => {
          const cfg = config();
          if (!cfg.enabled || !cfg.delimiters.includes(mode)) return false;
          rule.outerSpace = cfg.outerspace;
          const offset =
            kind === "inline"
              ? state.pos
              : state.bMarks[args[0]] + state.tShift[args[0]];
          const length = state.tokens.length;
          if (
            kind === "inline" &&
            rule.tag === "$" &&
            /\d/.test(state.src[offset + 1] || "")
          ) {
            rule.rex.lastIndex = offset;
            const body = rule.rex.exec(state.src)?.[1] || "";
            // A numeric amount followed by prose should not consume the next
            // formula's opening dollar as its own closing delimiter.
            if (
              /^\d[\s\S]*\s[A-Za-z]{2,}/.test(body) &&
              !/[=+*/^_<>-]|\\[A-Za-z]/.test(body)
            ) {
              return false;
            }
          }
          const matched = parser(state, ...args);
          if (matched && state.tokens.length > length) {
            const t = state.tokens.at(-1);
            if (kind === "block" && !template.name.endsWith("_eqno"))
              t.info = "";
            t.meta = {
              ...t.meta,
              inkpageDisplay: kind === "block" || Boolean(template.displayMode),
              inkpageOffset: offset,
              inkpageEnd: state.pos,
              inkpageSource: state.src.slice(offset, rule.rex.lastIndex),
              inkpageOpen: rule.tag,
              inkpageClose:
                mode === "brackets"
                  ? kind === "block"
                    ? "\\]"
                    : "\\)"
                  : rule.tag,
            };
          }
          return matched;
        };
        (parsers[kind][mode] ||= []).push(wrapped);
        md.renderer.rules[name] = render;
      }
  for (const kind of ["inline", "block"])
    (kind === "inline" ? md.inline.ruler : md.block.ruler).before(
      kind === "inline" ? "escape" : "fence",
      "inkpage_math_" + kind,
      (state, ...args) => {
        const cfg = config();
        if (!cfg.enabled) return false;
        for (const mode of cfg.delimiters)
          for (const parser of parsers[kind][mode])
            if (parser(state, ...args)) return true;
        return false;
      },
    );
  md.core.ruler.after("inline", "inkpage_math_lines", (state) => {
    let currentLine = 0;
    for (const token of state.tokens) {
      if (token.map) currentLine = token.map[0];
      for (const child of token.children || [])
        if (
          child.type.startsWith("inkpage_") &&
          child.meta?.inkpageOffset !== undefined
        ) {
          child.meta.inkpageLine =
            (token.map?.[0] ?? currentLine) +
            (
              token.content.slice(0, child.meta.inkpageOffset).match(/\n/g) ||
              []
            ).length;
        }
    }
  });
}

function mathErrors(env) {
  const errors = (env.inkpageMathErrors || []).filter(
    (error) => !error.fallbackToCode,
  );
  if (errors.length)
    throw new Error(
      t(
        "Math parsing failed: {0}",
        errors
          .slice(0, 8)
          .map((e) => t("Line {0}: {1}", e.line, e.message))
          .join("; "),
      ),
    );
}

function restoreMath(html, env) {
  return html.replace(
    /INKPAGEMATH[0-9a-f]{40}/g,
    (key) => env.inkpageTrusted?.get(key) ?? key,
  );
}

module.exports = { installMath, normalizeMath, mathErrors, restoreMath, MODES };
