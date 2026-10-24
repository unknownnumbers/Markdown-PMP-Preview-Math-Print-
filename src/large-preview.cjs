"use strict";
const vscode = require("vscode");
const path = require("node:path");
const crypto = require("node:crypto");
const { t, getLanguage } = require("./i18n.cjs");
const { getSettings, affectsSettings } = require("./settings.cjs");
const { escapeHtml, assetUrl } = require("./render.cjs");
const { variableCss, cssValue } = require("./theme.cjs");
const {
  renderLargeDocument,
  chunkAtLine,
  DocumentSearch,
  lineAfterChanges,
} = require("./large-preview-document.cjs");

const VIEW_TYPE = "Markdown-PMP.largePreview";
const LARGE_CHARACTERS = 256_000;
const isLargeDocument = (doc) =>
  doc.languageId === "markdown" && doc.getText().length >= LARGE_CHARACTERS;

function createLargePreview(
  context,
  { readOptions, readMath, log, onActivate },
) {
  const previews = new Set();
  const nativeOptions = new Map();
  const subscriptions = [];
  const editorReveals = new WeakMap();
  let active;
  const error = (e) => log.appendLine(e.stack || String(e));
  const settings = (uri) => vscode.workspace.getConfiguration("markdown", uri);
  const enabled = () => getSettings(vscode).get("largePreview.enabled", true);
  const forDocument = (uri) =>
    [...previews].filter(
      (state) => state.document.uri.toString() === uri.toString(),
    );
  function html(state) {
    const webview = state.panel.webview;
    const nonce = crypto.randomBytes(18).toString("base64");
    const url = (name) =>
      escapeHtml(
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, "assets", name),
          )
          .toString(),
      );
    const native = vscode.extensions.getExtension(
      "vscode.markdown-language-features",
    );
    const nativeUrl = (name) =>
      escapeHtml(
        webview
          .asWebviewUri(vscode.Uri.joinPath(native.extensionUri, "media", name))
          .toString(),
      );
    return `<!doctype html><html lang="${escapeHtml(getLanguage())}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: http: data:; base-uri 'none'; form-action 'none'">
      <link rel="stylesheet" href="${nativeUrl("markdown.css")}"><link rel="stylesheet" href="${nativeUrl("highlight.css")}">
      <link rel="stylesheet" href="${url("fonts.css")}"><link rel="stylesheet" href="${url("preview.css")}">
      <link rel="stylesheet" href="${url("math/math.css")}"><link rel="stylesheet" href="${url("large-preview.css")}"><style id="pmp-variables"></style>
      <script nonce="${nonce}" src="${url("large-preview.js")}" defer></script></head><body>
      <span id="pmp-theme-marker" hidden></span><nav id="pmp-tools"><button id="pmp-headings" type="button">${escapeHtml(t("Headings"))}</button><button id="pmp-show-find" type="button">${escapeHtml(t("Find"))}</button></nav>
      <div id="pmp-find" role="search" hidden><input id="pmp-query" aria-label="${escapeHtml(t("Find in document"))}" placeholder="${escapeHtml(t("Find in document"))}"><span id="pmp-count" aria-live="polite"></span><button id="pmp-find-previous" title="${escapeHtml(t("Previous match"))}" aria-label="${escapeHtml(t("Previous match"))}">↑</button><button id="pmp-find-next" title="${escapeHtml(t("Next match"))}" aria-label="${escapeHtml(t("Next match"))}">↓</button><button id="pmp-find-close" title="${escapeHtml(t("Close"))}" aria-label="${escapeHtml(t("Close"))}">×</button></div>
      <main id="pmp-content" class="markdown-body" tabindex="-1" aria-label="${escapeHtml(t("Markdown preview"))}"></main><div id="pmp-message" role="status">${escapeHtml(t("Preparing preview…"))}</div></body></html>`;
  }
  function modelMessage(state, line) {
    const model = state.model;
    const id =
      state.initialAnchor && Object.hasOwn(model.idChunks, state.initialAnchor)
        ? state.initialAnchor
        : undefined;
    return {
      type: "document",
      revision: state.revision,
      line,
      chunk: id ? model.idChunks[id] : chunkAtLine(model, line),
      id,
      model: {
        themed: state.options.theme !== "default",
        doubleClickToSwitchToEditor: settings(state.document.uri).get(
          "preview.doubleClickToSwitchToEditor",
          true,
        ),
        css: state.css,
        lineCount: model.lineCount,
        tables: model.tables,
        chunks: model.chunks.map((chunk) => ({
          line: chunk.line,
          units: chunk.text.length * 0.6,
          runs: chunk.anchors.map((anchor) => [anchor.units, anchor.kind]),
        })),
      },
    };
  }
  function sendDocument(state, line = state.line) {
    if (state.ready && state.model) {
      void state.panel.webview.postMessage(modelMessage(state, line));
      state.initialAnchor = undefined;
    }
  }
  function render(state) {
    if (state.disposed) return;
    try {
      const doc = state.document;
      const options = readOptions(doc.uri);
      const config = settings(doc.uri);
      const root = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri;
      const model = renderLargeDocument(doc.getText(), {
        theme: options.theme,
        breaks: config.get("preview.breaks", false),
        linkify: config.get("preview.linkify", true),
        typographer: config.get("preview.typographer", false),
        frontMatter: config.get("preview.frontMatter", "table"),
        math: readMath("preview"),
        assetUri(value) {
          const uri = vscode.Uri.parse(
            assetUrl(value, doc.uri.toString(), root?.toString()),
          );
          return ["file", "vscode-remote"].includes(uri.scheme)
            ? state.panel.webview.asWebviewUri(uri).toString()
            : uri.toString();
        },
      });
      const family =
        config.get("preview.fontFamily", "") ||
        '-apple-system,BlinkMacSystemFont,"Segoe WPC","Segoe UI",system-ui,Ubuntu,"Droid Sans",sans-serif';
      const codeFamily = vscode.workspace
        .getConfiguration("editor", doc.uri)
        .get("fontFamily", "monospace");
      state.css = `:root{--markdown-font-family:${cssValue(family)};--markdown-font-size:${Number(config.get("preview.fontSize", 14))}px;--markdown-line-height:${Number(config.get("preview.lineHeight", 1.6))};--vscode-editor-font-family:${cssValue(codeFamily)}}html{padding:0}body{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);box-sizing:border-box}code{font-family:var(--vscode-editor-font-family)}${options.theme === "default" ? "" : variableCss(options)}`;
      state.options = options;
      state.error = undefined;
      state.model = model;
      state.renderPending = false;
      state.revision++;
      state.search = undefined;
      state.line = Math.min(state.line, model.lineCount - 1);
      log.appendLine(
        `[Preview] ${path.basename(doc.fileName)}: ${model.chunks.length} chunks, ${model.renderMs} ms`,
      );
      sendDocument(state);
    } catch (e) {
      state.renderPending = false;
      error(e);
      state.error = t("Could not prepare preview: {0}", e.message);
      void state.panel.webview.postMessage({
        type: "error",
        message: state.error,
      });
    }
  }
  function reveal(state, line, anchor, syncSource = false) {
    state.line = Math.max(0, Math.min(state.document.lineCount - 1, line));
    if (state.renderPending) return;
    void state.panel.webview.postMessage({
      type: "reveal",
      revision: state.revision,
      line: state.line,
      chunk: anchor?.chunk ?? chunkAtLine(state.model, state.line),
      id: anchor?.id,
      syncSource,
    });
  }
  function sourceEditor(state, line, focus = false) {
    const revealEditor = (editor) => {
      const sourceLine = Math.max(
        0,
        Math.min(editor.document.lineCount - 1, Math.floor(line)),
      );
      const wraps =
        vscode.workspace
          .getConfiguration("editor", editor.document.uri)
          .get("wordWrap", "off") !== "off";
      const character = wraps
        ? Math.round(
            (line % 1) * editor.document.lineAt(sourceLine).text.length,
          )
        : 0;
      const position = new vscode.Position(sourceLine, character);
      editorReveals.set(editor, Date.now() + 200);
      if (focus) editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.AtTop,
      );
    };
    const editors = vscode.window.visibleTextEditors.filter(
      (editor) =>
        editor.document.uri.toString() === state.document.uri.toString(),
    );
    if (editors.length && !focus)
      for (const editor of editors) revealEditor(editor);
    else if (focus)
      void vscode.window
        .showTextDocument(state.document, {
          viewColumn: editors[0]?.viewColumn || vscode.ViewColumn.One,
        })
        .then(revealEditor, error);
  }
  async function link(state, href) {
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      const chunk = state.model.idChunks[id];
      if (chunk !== undefined) {
        const heading = state.model.headings.find((x) => x.id === id);
        reveal(
          state,
          heading?.line ?? state.model.chunks[chunk].line,
          { chunk, id },
          true,
        );
      }
      return;
    }
    const absolute = assetUrl(
      href,
      state.document.uri.toString(),
      vscode.workspace.getWorkspaceFolder(state.document.uri)?.uri.toString(),
    );
    const uri = vscode.Uri.parse(absolute);
    if (["http", "https", "mailto", "tel"].includes(uri.scheme))
      return vscode.env.openExternal(uri);
    if (["file", "vscode-remote"].includes(uri.scheme)) {
      if (/\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i.test(uri.path)) {
        const doc = await vscode.workspace.openTextDocument(
          uri.with({ fragment: "" }),
        );
        if (isLargeDocument(doc) && enabled()) {
          const next = await open(doc.uri);
          if (uri.fragment) await link(next, "#" + uri.fragment);
          return;
        }
      }
      return vscode.commands.executeCommand("vscode.open", uri);
    }
  }
  async function receive(state, message) {
    if (message.type === "ready") {
      state.ready = true;
      if (Number.isFinite(message.line)) state.line = message.line;
      sendDocument(state);
      if (state.error)
        void state.panel.webview.postMessage({
          type: "error",
          message: state.error,
        });
      return;
    }
    if (!state.model || message.revision !== state.revision) return;
    if (message.type === "chunks") {
      const chunks = message.indices
        .filter((index) => Number.isInteger(index) && state.model.chunks[index])
        .map((index) => ({ index, html: state.model.chunks[index].html }));
      await state.panel.webview.postMessage({
        type: "chunks",
        revision: state.revision,
        chunks,
      });
    } else if (
      message.type === "position" &&
      Number.isFinite(message.line) &&
      !state.renderPending
    ) {
      state.line = message.line;
      if (
        !message.programmatic &&
        settings(state.document.uri).get(
          "preview.scrollEditorWithPreview",
          true,
        )
      )
        sourceEditor(state, message.line);
    } else if (message.type === "find" && typeof message.query === "string") {
      if (state.search?.query !== message.query)
        state.search = new DocumentSearch(state.model, message.query);
      await state.panel.webview.postMessage({
        type: "findResult",
        revision: state.revision,
        query: message.query,
        result: state.search.at(message.index),
      });
    } else if (message.type === "headings") {
      const pick = await vscode.window.showQuickPick(
        state.model.headings.map((heading) => ({
          label: "  ".repeat(heading.level - 1) + heading.text,
          description: t("Line {0}", heading.line + 1),
          heading,
        })),
        { placeHolder: t("Go to heading") },
      );
      if (pick) reveal(state, pick.heading.line, undefined, true);
    } else if (message.type === "source" && Number.isFinite(message.line))
      sourceEditor(state, message.line, true);
    else if (message.type === "link" && typeof message.href === "string")
      await link(state, message.href);
  }
  function attach(doc, panel, options = {}) {
    const key = doc.uri.toString();
    const native = vscode.extensions.getExtension(
      "vscode.markdown-language-features",
    );
    const roots = [
      context.extensionUri,
      native.extensionUri,
      vscode.Uri.joinPath(doc.uri, ".."),
      ...(vscode.workspace.workspaceFolders || []).map((x) => x.uri),
    ];
    const editor = vscode.window.visibleTextEditors.find(
      (x) =>
        x.document.uri.toString() === key &&
        (!options.sourceColumn || x.viewColumn === options.sourceColumn),
    );
    panel.title = t("Preview: {0}", path.basename(doc.fileName));
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
    const state = {
      panel,
      document: doc,
      line: Number.isFinite(options.initialLine)
        ? options.initialLine
        : editor?.visibleRanges[0]?.start.line || 0,
      initialAnchor: options.fragment,
      revision: 0,
      ready: false,
      disposed: false,
      nativeContext: Boolean(options.nativeContext),
    };
    previews.add(state);
    if (panel.active) {
      active = state;
      onActivate(doc.uri);
    }
    panel.onDidDispose(() => {
      state.disposed = true;
      clearTimeout(state.timer);
      previews.delete(state);
      if (active === state) active = undefined;
    });
    panel.onDidChangeViewState(() => {
      if (panel.active) {
        active = state;
        onActivate(doc.uri);
      }
    });
    panel.webview.onDidReceiveMessage((message) => {
      void receive(state, message).catch(error);
    });
    panel.webview.html = html(state);
    render(state);
    return state;
  }
  async function open(uri, beside = true) {
    const doc = await vscode.workspace.openTextDocument(uri);
    const existing = forDocument(doc.uri)[0];
    if (existing) {
      existing.panel.reveal(existing.panel.viewColumn);
      return existing;
    }
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "Markdown PMP",
      beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
      {
        enableScripts: true,
        enableFindWidget: false,
        retainContextWhenHidden: true,
      },
    );
    return attach(doc, panel);
  }
  async function openNative(uri, options, openEditor) {
    const key = `${uri.toString()}@${options.viewColumn}`;
    nativeOptions.set(key, options);
    try {
      if (openEditor) await openEditor();
      else
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          VIEW_TYPE,
          {
            viewColumn: options.viewColumn,
            preserveFocus: options.preserveFocus,
            preview: false,
          },
        );
      const state = forDocument(uri).find(
        (state) => state.panel.viewColumn === options.viewColumn,
      );
      if (!state) throw new Error(t("The continuous preview did not open."));
      state.nativeContext = true;
      if (state.ready && Number.isFinite(options.initialLine))
        reveal(state, options.initialLine);
      if (state.ready && options.fragment)
        await link(state, "#" + options.fragment);
      return state;
    } finally {
      nativeOptions.delete(key);
    }
  }
  subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      {
        resolveCustomTextEditor(doc, panel) {
          attach(
            doc,
            panel,
            nativeOptions.get(`${doc.uri.toString()}@${panel.viewColumn}`) || {
              nativeContext: true,
            },
          );
        },
      },
      {
        webviewOptions: {
          enableFindWidget: false,
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: true,
      },
    ),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      const until = editorReveals.get(event.textEditor);
      if (until) {
        if (
          until > Date.now() &&
          vscode.window.activeTextEditor !== event.textEditor
        )
          return;
        editorReveals.delete(event.textEditor);
      }
      if (
        !settings(event.textEditor.document.uri).get(
          "preview.scrollPreviewWithEditor",
          true,
        )
      )
        return;
      const position = event.visibleRanges[0]?.start;
      for (const state of forDocument(event.textEditor.document.uri)) {
        if (!state.ready || !state.model || !position) continue;
        if (
          state.renderPending &&
          vscode.window.activeTextEditor !== event.textEditor
        )
          continue;
        const length = event.textEditor.document.lineAt(position.line).text
          .length;
        reveal(
          state,
          position.line + (length ? position.character / length : 0),
        );
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!event.contentChanges.length) return;
      for (const state of forDocument(event.document.uri)) {
        state.line = lineAfterChanges(state.line, event.contentChanges);
        state.renderPending = true;
        state.document = event.document;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => render(state), 350);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        affectsSettings(event) ||
        event.affectsConfiguration("markdown") ||
        event.affectsConfiguration("editor.fontFamily")
      ) {
        for (const state of previews.values()) {
          if (state.nativeContext && !enabled()) continue;
          clearTimeout(state.timer);
          state.timer = setTimeout(() => render(state), 80);
        }
      }
    }),
  );
  return {
    viewType: VIEW_TYPE,
    open,
    openNative,
    get previews() {
      return [...previews];
    },
    isLargeDocument,
    get activeDocument() {
      return active?.panel.active ? active.document.uri : undefined;
    },
    dispose() {
      for (const item of subscriptions) item.dispose();
      for (const state of previews.values()) state.panel.dispose();
    },
  };
}
module.exports = { createLargePreview, isLargeDocument, VIEW_TYPE };
