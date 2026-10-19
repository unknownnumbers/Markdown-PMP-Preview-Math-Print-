"use strict";
const { t } = require("./i18n.cjs");

const crypto = require("node:crypto");
const katex = require("katex");
const texmath = require("markdown-it-texmath");
const MODES = ["dollars", "brackets", "gitlab", "julia", "kramdown"];
const INSTALLED = Symbol("inkpage.math");
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
    env.inkpageMacros ||= { ...cfg.macros };
    const line =
      (token.map?.[0] ?? token.meta?.inkpageLine ?? 0) +
      1 +
      (env.inkpageLineOffset || 0);
    let result;
    try {
      result = katex.renderToString(token.content, {
        displayMode: token.meta?.inkpageDisplay,
        macros: env.inkpageMacros,
        throwOnError: true,
        strict: "warn",
        trust: false,
        maxExpand: 1000,
        output: "htmlAndMathml",
      });
      result = result.replace(
        /class="([^"]*)"/g,
        (_, classes) =>
          `class="${classes
            .split(/\s+/)
            .map((c) => c.replace(/^katex/, "inkpage-katex"))
            .join(" ")}"`,
      );
    } catch (error) {
      (env.inkpageMathErrors ||= []).push({
        line,
        message: error.message,
        source: token.content,
      });
      result = `<code class="inkpage-math-error" title="${escape(error.message)}">${escape(token.meta?.inkpageOpen || token.markup || "")}${escape(token.content)}${escape(token.meta?.inkpageClose || token.markup || "")}</code><span class="inkpage-math-error-message">${escape(t("Math error · line {0}: {1}", line, error.message))}</span>`;
    }
    const tag = token.block ? "div" : "span";
    const number = token.info
      ? `<span class="inkpage-equation-number">(${escape(token.info)})</span>`
      : "";
    const html = `<${tag} class="inkpage-math${token.meta?.inkpageDisplay ? " inkpage-math-display" : ""}" data-inkpage-line="${line}"><span class="inkpage-equation-content">${result}</span>${number}</${tag}>`;
    if (env.inkpageTrusted) {
      const key = "INKPAGEMATH" + crypto.randomBytes(20).toString("hex");
      env.inkpageTrusted.set(key, html);
      return key;
    }
    return html;
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
        const parser =
          kind === "inline" ? texmath.inline(rule) : texmath.block(rule);
        const wrapped = (state, ...args) => {
          const cfg = config();
          if (!cfg.enabled || !cfg.delimiters.includes(mode)) return false;
          rule.outerSpace = cfg.outerspace;
          const offset = state.pos;
          const length = state.tokens.length;
          const matched = parser(state, ...args);
          if (matched && state.tokens.length > length) {
            const t = state.tokens.at(-1);
            if (kind === "block" && !template.name.endsWith("_eqno"))
              t.info = "";
            t.meta = {
              ...t.meta,
              inkpageDisplay: kind === "block" || Boolean(template.displayMode),
              inkpageOffset: offset,
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
  if (env.inkpageMathErrors?.length)
    throw new Error(
      t(
        "Math parsing failed: {0}",
        env.inkpageMathErrors
          .slice(0, 8)
          .map((e) => t("Line {0}: {1}", e.line, e.message))
          .join("; "),
      ),
    );
}

module.exports = { installMath, normalizeMath, mathErrors, MODES };
