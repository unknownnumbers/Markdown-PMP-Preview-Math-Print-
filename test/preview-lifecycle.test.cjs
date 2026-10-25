"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const filename = require.resolve("../src/large-preview.cjs");
const localRequire = createRequire(filename);
const uri = (path) => ({ path, toString: () => "file://" + path });
const disposable = { dispose() {} };
const event = () => disposable;

function fixture({
  characters = 256_001,
  pmpSettings = {},
  nativeSettings = {},
} = {}) {
  let provider,
    configurationChanged,
    parseCount = 0;
  const timers = new Map(),
    calls = [],
    logs = [];
  const doc = {
    uri: uri("/article.md"),
    fileName: "/article.md",
    languageId: "markdown",
    lineCount: 100,
    version: 1,
    isDirty: true,
    getText: () => "A".repeat(characters),
    lineAt: () => ({ text: "abcdefghij" }),
  };
  class TabInputCustom {
    constructor() {
      this.uri = doc.uri;
      this.viewType = "Markdown-PMP.largePreview";
    }
  }
  class TabInputWebview {}
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
  const group = { viewColumn: 1 };
  const editor = {
    document: doc,
    viewColumn: 1,
    selection: { active: new Position(30, 4) },
    visibleRanges: [new Range(new Position(12, 6), new Position(13, 0))],
    revealRange(range, type) {
      this.revealed = range;
      this.revealType = type;
    },
    setDecorations(marker, ranges) {
      this.marker = marker;
      this.markedRanges = ranges;
    },
  };
  let panel;
  const config = {
    get: (key, value) => nativeSettings[key] ?? value,
    inspect: () => ({}),
  };
  const vscode = {
    TabInputCustom,
    TabInputWebview,
    Position,
    Range,
    Selection: Range,
    TextEditorRevealType: { AtTop: 1, InCenter: 2 },
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    ViewColumn: { One: 1 },
    Uri: { joinPath: (base, ...parts) => uri([base.path, ...parts].join("/")) },
    extensions: { getExtension: () => ({ extensionUri: uri("/native") }) },
    commands: {
      async executeCommand(command, ...args) {
        calls.push([command, ...args]);
        if (command === "reopenActiveEditorWith") openPreview();
        else if (command === "vscode.openWith")
          openPreview(args[2].viewColumn, args[2].preserveFocus);
        else if (command === "workbench.action.reopenTextEditor") {
          panel?.dispose();
          group.activeTab = { input: { uri: doc.uri }, group };
          vscode.window.activeTextEditor = editor;
          editor.viewColumn = group.viewColumn;
          vscode.window.visibleTextEditors = [editor];
        } else if (command !== "markdown.togglePreview")
          assert.fail(`Unexpected command: ${command}`);
      },
    },
    window: {
      activeTextEditor: editor,
      createTextEditorDecorationType(options) {
        return {
          options,
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        };
      },
      visibleTextEditors: [editor],
      tabGroups: {
        activeTabGroup: group,
        async close(tab, preserveFocus) {
          calls.push(["closeTab", tab, preserveFocus]);
        },
      },
      registerCustomEditorProvider(_type, value) {
        provider = value;
        return disposable;
      },
      onDidChangeTextEditorVisibleRanges: event,
      onDidChangeActiveTextEditor: event,
      async showTextDocument(document, options) {
        calls.push(["showTextDocument", document, options]);
        assert.equal(document, doc);
        vscode.window.activeTextEditor = editor;
        group.viewColumn = options.viewColumn;
        group.activeTab = { input: { uri: doc.uri }, group };
        return editor;
      },
    },
    workspace: {
      getConfiguration: (section) =>
        section === "Markdown-PMP"
          ? {
              inspect: () => ({}),
              get: (key, fallback) => pmpSettings[key] ?? fallback,
            }
          : config,
      getWorkspaceFolder: () => undefined,
      onDidCloseTextDocument: event,
      onDidChangeTextDocument: event,
      onDidChangeConfiguration(callback) {
        configurationChanged = callback;
        return disposable;
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      require(name) {
        if (name === "vscode") return vscode;
        if (name === "./large-preview-document.cjs")
          return {
            ...localRequire(name),
            renderLargeDocument() {
              parseCount++;
              return {
                chunks: [],
                sourceAnchors: [],
                lineCount: 100,
                renderMs: 1,
              };
            },
          };
        return localRequire(name);
      },
      performance,
      process,
      setTimeout(callback) {
        const id = timers.size + 1;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
    { filename },
  );
  const preview = module.exports.createLargePreview(
    { extensionUri: uri("/pmp") },
    {
      readOptions: () => ({ theme: "default" }),
      readMath: () => ({ enabled: true }),
      log: { appendLine: (message) => logs.push(message) },
      onActivate() {},
      nativeSource: () => ({ document: doc, line: 24.5 }),
    },
  );
  function openPreview(column = 1, preserveFocus = false) {
    const disposes = [];
    group.viewColumn = column;
    group.activeTab = { input: new TabInputCustom(), group };
    panel = {
      active: true,
      viewColumn: column,
      onDidChangeViewState: event,
      onDidDispose(callback) {
        disposes.push(callback);
        return disposable;
      },
      dispose() {
        for (const callback of disposes) callback();
      },
      reveal(_column, keepFocus) {
        calls.push(["reveal", _column, keepFocus]);
      },
      webview: {
        asWebviewUri: (value) => value,
        onDidReceiveMessage(callback) {
          this.receive = callback;
        },
        messages: [],
        async postMessage(message) {
          this.messages.push(message);
        },
      },
    };
    provider.resolveCustomTextEditor(doc, panel);
    if (!preserveFocus) {
      vscode.window.activeTextEditor = undefined;
      vscode.window.visibleTextEditors = column === 1 ? [] : [editor];
    }
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
    return preview.previews.at(-1);
  }
  return {
    preview,
    doc,
    editor,
    calls,
    logs,
    vscode,
    openPreview,
    get parseCount() {
      return parseCount;
    },
    changeSettings() {
      configurationChanged({ affectsConfiguration: () => true });
    },
  };
}

test("Same-tab preview uses native reopening and reuses its parsed document after the webview is disposed", async () => {
  const f = fixture();
  await f.preview.toggle();
  assert.deepEqual(f.calls, [
    ["reopenActiveEditorWith", "Markdown-PMP.largePreview"],
  ]);
  const first = f.preview.previews[0].model;
  f.preview.previews[0].line = 24.5;
  await f.preview.toggle();
  assert.equal(f.calls.at(-1)[0], "workbench.action.reopenTextEditor");
  assert.equal(f.preview.previews.length, 0);
  assert.equal(f.doc.isDirty, true);
  assert.deepEqual({ ...f.editor.selection.start }, { line: 24, character: 6 });
  await f.preview.toggle();
  assert.equal(f.preview.previews[0].model, first);
  assert.equal(f.parseCount, 1);
  await f.preview.toggle();
  f.doc.version++;
  await f.preview.toggle();
  assert.equal(
    f.parseCount,
    2,
    "Source changes invalidate the parsed document",
  );
  await f.preview.toggle();
  f.changeSettings();
  await f.preview.toggle();
  assert.equal(
    f.parseCount,
    3,
    "Theme and Markdown settings invalidate the parsed document",
  );
  f.preview.dispose();
});

test("Toggling a side preview replaces that current tab with text in the same group", async () => {
  const f = fixture();
  const state = f.openPreview(2);
  state.line = 24.5;
  await f.preview.toggle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], "workbench.action.reopenTextEditor");
  assert.equal(f.editor.viewColumn, 2);
  assert.equal(f.preview.previews.length, 0);
  assert.deepEqual({ ...f.editor.selection.start }, { line: 24, character: 6 });
  f.preview.dispose();
});

test("Double-click source navigation centers and marks the source, returns to its group and keeps the side preview", async () => {
  const f = fixture();
  const state = f.openPreview(2);
  state.panel.webview.receive({
    type: "source",
    revision: state.revision,
    line: 24,
  });
  await new Promise(setImmediate);
  assert.equal(f.calls[0][0], "showTextDocument");
  assert.equal(f.calls[0][2].viewColumn, 1);
  assert.equal(f.preview.previews[0], state);
  assert.deepEqual({ ...f.editor.selection.start }, { line: 24, character: 0 });
  assert.equal(f.editor.revealType, f.vscode.TextEditorRevealType.InCenter);
  assert.equal(f.editor.marker.disposed, false);
  assert.equal(f.editor.marker.options.isWholeLine, true);
  const marker = f.editor.marker;
  f.preview.dispose();
  assert.equal(marker.disposed, true);
});

test("An explicit double-click setting of false keeps source navigation disabled", async () => {
  const f = fixture({
    nativeSettings: { "preview.doubleClickToSwitchToEditor": false },
  });
  const state = f.openPreview(2);
  state.panel.webview.receive({ type: "ready", line: 0 });
  assert.equal(
    state.panel.webview.messages.at(-1).model.doubleClickToSwitchToEditor,
    false,
  );
  const callsBeforeSource = f.calls.length;
  state.panel.webview.receive({
    type: "source",
    revision: state.revision,
    line: 24,
  });
  await new Promise(setImmediate);
  assert.equal(f.calls.length, callsBeforeSource);
  f.preview.dispose();
});

test("Toggling a native side preview opens text in that column even when the same source is visible on the left", async () => {
  const f = fixture();
  const group = f.vscode.window.tabGroups.activeTabGroup;
  group.viewColumn = 2;
  const input = new f.vscode.TabInputWebview();
  input.viewType = "mainThreadWebview-markdown.preview";
  const tab = { input, group };
  group.activeTab = tab;
  await f.preview.toggle();
  assert.equal(f.calls[0][0], "showTextDocument");
  assert.equal(f.calls[0][2].viewColumn, 2);
  assert.deepEqual(f.calls[1], ["closeTab", tab, true]);
  assert.equal(f.doc.isDirty, true);
  f.preview.dispose();
});

test("Native custom-preview toggle uses the active tab even if activeTextEditor still refers to the source on the left", async () => {
  const f = fixture();
  const group = f.vscode.window.tabGroups.activeTabGroup;
  group.viewColumn = 2;
  const input = new f.vscode.TabInputCustom();
  input.viewType = "vscode.markdown.preview.editor";
  group.activeTab = { input, group };
  assert.equal(f.vscode.window.activeTextEditor.viewColumn, 1);
  await f.preview.toggle();
  assert.deepEqual(f.calls, [["workbench.action.reopenTextEditor"]]);
  assert.equal(f.editor.viewColumn, 2);
  f.preview.dispose();
});

test("PMP forward search uses the cursor, preserves source focus, queues the initial locate and reuses only the right column", async () => {
  const f = fixture({
    characters: 100,
    pmpSettings: { "largePreview.enabled": false },
  });
  assert.equal(f.preview.shouldUsePmp(f.doc), false);
  await f.preview.forwardSearch();
  const state = f.preview.previews[0];
  assert.equal(state.panel.viewColumn, 2);
  assert.equal(state.sourceColumn, 1);
  assert.equal(state.nativeContext, false);
  assert.equal(f.vscode.window.activeTextEditor, f.editor);
  assert.equal(f.vscode.window.tabGroups.activeTabGroup.viewColumn, 1);
  assert.ok(
    f.calls.some(
      ([command, _doc, options]) =>
        command === "showTextDocument" && options.viewColumn === 1,
    ),
  );
  state.panel.webview.receive({ type: "ready", line: 0 });
  assert.equal(state.panel.webview.messages.at(-1).line, 30);
  assert.equal(state.panel.webview.messages.at(-1).locate, true);
  assert.equal(state.panel.webview.messages.at(-1).location.character, 4);
  assert.equal(state.panel.webview.messages.at(-1).location.before, "abcd");
  f.editor.selection = { active: { line: 75, character: 1 } };
  await f.preview.forwardSearch();
  assert.equal(f.preview.previews.length, 1);
  assert.deepEqual(f.calls.at(-1), ["reveal", 2, true]);
  assert.equal(state.panel.webview.messages.at(-1).line, 75);
  assert.equal(state.panel.webview.messages.at(-1).locate, true);
  assert.equal(f.vscode.window.activeTextEditor, f.editor);
  await f.preview.toggle();
  assert.equal(
    f.preview.previews.length,
    1,
    "Same-tab toggle keeps the existing side preview",
  );
  assert.ok(f.preview.previews.some((item) => item.panel.viewColumn === 2));
  f.preview.dispose();
});

test("Same-tab preview hands keyboard focus to the ready webview while forward search preserves source focus", async () => {
  const f = fixture();
  await f.preview.toggle();
  const state = f.preview.previews[0];
  state.panel.webview.receive({ type: "ready" });
  assert.equal(
    state.panel.webview.messages.some((message) => message.type === "focus"),
    true,
  );
  assert.ok(
    f.calls.some(
      ([name, column, preserve]) =>
        name === "reveal" && column === 1 && preserve === false,
    ),
  );
  await f.preview.toggle();
  f.editor.selection = { active: { line: 30, character: 4 } };
  await f.preview.forwardSearch();
  const side = f.preview.previews[0];
  side.panel.webview.receive({ type: "ready" });
  assert.equal(
    side.panel.webview.messages.some((message) => message.type === "focus"),
    false,
  );
  assert.equal(f.vscode.window.activeTextEditor, f.editor);
  f.preview.dispose();
});

test("Forward search sends the default rectangle indicator or the selected circle to the preview", () => {
  for (const value of [undefined, "rectangle", "circle"]) {
    const f = fixture({
      pmpSettings: value ? { "preview.forwardSearchIndicator": value } : {},
    });
    const state = f.openPreview(2);
    state.panel.webview.receive({ type: "ready", line: 0 });
    assert.equal(
      state.panel.webview.messages.at(-1).model.forwardSearchIndicator,
      value || "rectangle",
    );
    f.preview.dispose();
  }
});

test("Small files keep native preview by default and use PMP with a filename-only title when all-files mode is enabled", async () => {
  const pmpSettings = { "largePreview.enabled": false };
  const f = fixture({ characters: 100, pmpSettings });
  await f.preview.toggle();
  assert.deepEqual(f.calls, [["markdown.togglePreview"]]);
  assert.equal(f.preview.previews.length, 0);
  pmpSettings["preview.usePmpForAllFiles"] = true;
  await f.preview.toggle();
  assert.deepEqual(f.calls.at(-1), [
    "reopenActiveEditorWith",
    "Markdown-PMP.largePreview",
  ]);
  assert.equal(f.preview.previews[0].panel.title, "article.md");
  await f.preview.toggle();
  assert.equal(f.doc.isDirty, true);
  pmpSettings["preview.usePmpForAllFiles"] = false;
  await f.preview.toggle();
  assert.deepEqual(f.calls.at(-1), ["markdown.togglePreview"]);
  f.preview.dispose();
});

test("All-files mode retains the long title for large files even with automatic large previews disabled", async () => {
  const f = fixture({
    pmpSettings: {
      "largePreview.enabled": false,
      "preview.usePmpForAllFiles": true,
    },
  });
  await f.preview.toggle();
  assert.equal(f.preview.previews[0].panel.title, "Long Preview-article.md");
  assert.equal(
    f.preview.shouldUsePmp({ languageId: "plaintext" }),
    false,
    "All-files mode is limited to Markdown documents",
  );
  f.preview.dispose();
});
