"use strict";

const { installMath } = require("./math.cjs");
const { t } = require("./i18n.cjs");
const footnote = require("markdown-it-footnote");
const tasks = require("markdown-it-task-lists");
const MarkdownIt = require("markdown-it");
const INSTALLED = Symbol("inkpage.preview");

function guardedPlugin(md, plugin, active, options) {
  const restores = [];
  for (const ruler of [md.core.ruler, md.inline.ruler, md.block.ruler])
    for (const method of ["before", "after", "push"]) {
      const original = ruler[method];
      restores.push(() => {
        ruler[method] = original;
      });
      ruler[method] = function (...args) {
        const index = method === "push" ? 1 : 2;
        const fn = args[index];
        args[index] = function (state, ...rest) {
          return active()
            ? fn(state, ...rest)
            : ruler === md.core.ruler
              ? undefined
              : false;
        };
        return original.apply(this, args);
      };
    }
  const renderers = { ...md.renderer.rules };
  try {
    md.use(plugin, options);
  } finally {
    restores.forEach((fn) => fn());
  }
  for (const key of Object.keys(md.renderer.rules))
    if (renderers[key] && md.renderer.rules[key] !== renderers[key]) {
      const ours = md.renderer.rules[key],
        previous = renderers[key];
      md.renderer.rules[key] = (...args) =>
        active() ? ours(...args) : previous(...args);
    }
}

function installPreview(
  md,
  getOptions,
  getMath,
  variableCss,
  onError,
  onNativePreview,
  getSuppressAltMenus,
) {
  if (md[INSTALLED]) return md;
  md[INSTALLED] = true;
  let settings;
  function withSettings(env, action) {
    const previous = settings;
    try {
      settings = {
        options: getOptions(env?.currentDocument),
        math: getMath(),
        suppressAltMenus: getSuppressAltMenus?.(),
      };
      return action();
    } finally {
      settings = previous;
    }
  }
  const readOptions = () => settings?.options ?? getOptions();
  const readMath = () => settings?.math ?? getMath();
  const enhanced = () => readOptions().theme !== "default";
  guardedPlugin(md, footnote, enhanced);
  guardedPlugin(md, tasks, enhanced, { enabled: false });
  installMath(md, readMath);
  const parse = md.parse;
  const plainFence = new MarkdownIt().renderer.rules.fence;
  let fenceInstalled = false;
  md.parse = function (...args) {
    if (!fenceInstalled) {
      const originalFence = md.renderer.rules.fence;
      md.renderer.rules.fence = function (tokens, i, options, env, self) {
        // The built-in math fence wrapper is bypassed only while Inkpage owns math.
        if (
          readMath().enabled &&
          tokens[i].info.trim().split(/\s/)[0] === "math"
        )
          return plainFence(tokens, i, options, env, self);
        return originalFence(tokens, i, options, env, self);
      };
      fenceInstalled = true;
    }
    return withSettings(args[1], () => {
      const restore = [];
      if (readMath().enabled)
        for (const [ruler, names] of [
          [
            md.inline.ruler,
            ["math_inline", "math_inline_block", "math_inline_bare_block"],
          ],
          [md.block.ruler, ["math_block"]],
        ]) {
          for (const name of names) {
            const before = ruler.getRules("").length;
            ruler.disable(name, true);
            if (ruler.getRules("").length < before)
              restore.push(() => ruler.enable(name, true));
          }
        }
      try {
        return parse.apply(this, args);
      } catch (error) {
        onError?.(error);
        throw error;
      } finally {
        restore.forEach((fn) => fn());
      }
    });
  };
  const parseInline = md.parseInline;
  md.parseInline = function (...args) {
    return withSettings(args[1], () => parseInline.apply(this, args));
  };
  const render = md.renderer.render;
  md.renderer.render = function (tokens, options, env = {}) {
    return withSettings(env, () => {
      const keyboard =
        typeof settings.suppressAltMenus === "boolean"
          ? `\n<span class="pmp-preview-keyboard" data-pmp-suppress-alt-menus="${settings.suppressAltMenus}" hidden></span>`
          : "";
      if (onNativePreview?.(tokens, env))
        return `<p>${t("Preparing preview...")}</p>${keyboard}`;
      // Macro definitions are document-local, including repeated renders of cached tokens.
      delete env.inkpageMacros;
      delete env.inkpageMathErrors;
      // VS Code adds auto direction to both lists and their items. A large list
      // then repeatedly scans children that already determine their own direction.
      const renderTokens = tokens.map((token) => {
        if (
          (token.type === "bullet_list_open" ||
            token.type === "ordered_list_open") &&
          token.attrGet("data-line") !== null &&
          token.attrGet("dir") === "auto"
        )
          return Object.assign(
            Object.create(Object.getPrototypeOf(token)),
            token,
            {
              attrs: token.attrs.filter(([name]) => name !== "dir"),
            },
          );
        return token;
      });
      const html = render.call(this, renderTokens, options, env);
      return enhanced()
        ? `${html}${keyboard}\n<span class="inkpage-theme-marker"${html.length >= 256_000 ? " data-pmp-batch-fonts" : ""} hidden></span><style data-inkpage-theme>${variableCss(readOptions())}</style>`
        : html + keyboard;
    });
  };
  return md;
}
module.exports = { installPreview };
