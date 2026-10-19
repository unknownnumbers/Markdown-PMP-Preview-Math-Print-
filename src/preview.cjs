"use strict";

const { installMath } = require("./math.cjs");
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

function installPreview(md, getOptions, getMath, variableCss, onError) {
  if (md[INSTALLED]) return md;
  md[INSTALLED] = true;
  const enhanced = () => getOptions().theme !== "default";
  guardedPlugin(md, footnote, enhanced);
  guardedPlugin(md, tasks, enhanced, { enabled: false });
  installMath(md, getMath);
  const parse = md.parse;
  const plainFence = new MarkdownIt().renderer.rules.fence;
  let fenceInstalled = false;
  md.parse = function (...args) {
    if (!fenceInstalled) {
      const originalFence = md.renderer.rules.fence;
      md.renderer.rules.fence = function (tokens, i, options, env, self) {
        // The built-in math fence wrapper is bypassed only while Inkpage owns math.
        if (
          getMath().enabled &&
          tokens[i].info.trim().split(/\s/)[0] === "math"
        )
          return plainFence(tokens, i, options, env, self);
        return originalFence(tokens, i, options, env, self);
      };
      fenceInstalled = true;
    }
    const restore = [];
    if (getMath().enabled)
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
  };
  const render = md.renderer.render;
  md.renderer.render = function (tokens, options, env = {}) {
    // Macro definitions are document-local, including repeated renders of cached tokens.
    delete env.inkpageMacros;
    delete env.inkpageMathErrors;
    const html = render.call(this, tokens, options, env);
    return enhanced()
      ? `${html}\n<span class="inkpage-theme-marker" hidden></span><style data-inkpage-theme>${variableCss(getOptions(env.currentDocument))}</style>`
      : html;
  };
  return md;
}
module.exports = { installPreview };
