"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  findNativeTab,
  createNativePreviewRouter,
} = require("../src/native-preview-router.cjs");
const pkg = require("../package.json");
class TabInputCustom {
  constructor(uri, viewType = "vscode.markdown.preview.editor") {
    Object.assign(this, { uri, viewType });
  }
}
class TabInputWebview {
  constructor() {
    this.viewType = "mainThreadWebview-markdown.preview";
  }
}
const uri = (path) => ({
  path,
  scheme: "file",
  toString: () => "file://" + path,
});
function fixture(tabs, active) {
  const group = { tabs, activeTab: active, viewColumn: 2 };
  for (const tab of tabs) tab.group = group;
  return {
    TabInputCustom,
    TabInputWebview,
    window: { tabGroups: { all: [group], activeTabGroup: group } },
  };
}
test("Native preview routing targets the actual custom-editor resource, including explorer commands", () => {
  const a = uri("/A/note.md"),
    b = uri("/B/note.md");
  const first = { label: "Preview note.md", input: new TabInputCustom(a) };
  const second = { label: "Preview note.md", input: new TabInputCustom(b) };
  const vscode = fixture([first, second], first);
  assert.equal(findNativeTab(vscode, b), second);
});
test("A known background preview keeps its tab instead of taking the active preview", () => {
  const a = { label: "Preview note.md", input: new TabInputWebview() };
  const b = { label: "Preview note.md", input: new TabInputWebview() };
  const vscode = fixture([a, b], b);
  assert.equal(findNativeTab(vscode, uri("/A/note.md"), a), a);
  vscode.window.tabGroups.activeTabGroup.activeTab = undefined;
  assert.equal(findNativeTab(vscode, uri("/A/note.md")), undefined);
});
test("Rendering API calls and preview diffs are not converted into editor tabs", () => {
  const disposable = { dispose() {} };
  const vscode = fixture([], undefined);
  vscode.window.tabGroups.onDidChangeTabs = () => disposable;
  vscode.workspace = { onDidChangeConfiguration: () => disposable };
  const router = createNativePreviewRouter(vscode, {}, { appendLine() {} });
  assert.equal(
    router.onNativeRender([], { currentDocument: uri("/A/note.md") }),
    false,
  );
  assert.equal(
    router.onNativeRender([], {
      currentDocument: uri("/A/note.md"),
      resourceProvider: { isDiffView: true },
    }),
    false,
  );
  router.dispose();
});

test("Native source metadata survives a render that finishes before its tab is published", () => {
  const document = { uri: uri("/note.md") };
  const provider = { state: { line: 23.5 } };
  const vscode = fixture([], undefined);
  let tabsChanged;
  vscode.window.tabGroups.onDidChangeTabs = (callback) => {
    tabsChanged = callback;
    return { dispose() {} };
  };
  vscode.workspace = {
    textDocuments: [document],
    onDidChangeConfiguration: () => ({ dispose() {} }),
  };
  const router = createNativePreviewRouter(
    vscode,
    {
      shouldUsePmp: () => false,
    },
    { appendLine: (error) => assert.fail(error) },
  );
  assert.equal(
    router.onNativeRender([], {
      currentDocument: document.uri,
      resourceProvider: provider,
    }),
    false,
  );
  const tab = {
    label: "Preview note.md",
    input: new TabInputWebview(),
    group: vscode.window.tabGroups.activeTabGroup,
  };
  tab.group.tabs.push(tab);
  tabsChanged({ opened: [tab], changed: [], closed: [] });
  assert.equal(router.sourceForTab(tab).document, document);
  assert.equal(router.sourceForTab(tab).line, 23.5);
  router.dispose();
});

test("Changing all-files mode routes an already-rendered small preview and restores only ineligible files", async () => {
  const small = { uri: uri("/small.md"), large: false },
    large = { uri: uri("/large.md"), large: true };
  const tabs = [small, large].map((doc) => ({
    label: "Preview " + doc.uri.path.slice(1),
    input: new TabInputCustom(doc.uri),
  }));
  const vscode = fixture(tabs, tabs[0]);
  const previews = [],
    calls = [],
    errors = [];
  let allFiles = false,
    configurationChanged;
  const group = vscode.window.tabGroups.activeTabGroup;
  vscode.ViewColumn = { One: 1 };
  vscode.window.visibleTextEditors = [];
  vscode.window.tabGroups.onDidChangeTabs = () => ({ dispose() {} });
  vscode.workspace = {
    textDocuments: [small, large],
    onDidChangeConfiguration(callback) {
      configurationChanged = () =>
        callback({ affectsConfiguration: (name) => name === "Markdown-PMP" });
      return { dispose() {} };
    },
  };
  vscode.commands = {
    async executeCommand(command, resource, type) {
      if (command === "vscode.openWith")
        group.activeTab = tabs.find(
          (tab) => tab.input.uri.toString() === resource.toString(),
        );
      else if (command === "reopenActiveEditorWith") {
        const tab = group.activeTab;
        tab.input.viewType = resource;
        if (resource === "vscode.markdown.preview.editor") {
          previews.find(
            (state) => state.document.uri === tab.input.uri,
          ).disposed = true;
          calls.push(["restore", tab.input.uri.path]);
        }
      } else if (command === "workbench.action.openEditorAtIndex")
        group.activeTab = group.tabs[resource];
      else assert.fail(`Unexpected command: ${command}, ${type}`);
    },
  };
  const largePreview = {
    viewType: "Markdown-PMP.largePreview",
    previews,
    shouldUsePmp: (doc) => allFiles || doc.large,
    sourcePosition: () => undefined,
    async openNative(resource, options, replace) {
      await replace();
      const doc = [small, large].find((doc) => doc.uri === resource);
      previews.push({
        document: doc,
        panel: { viewColumn: 2 },
        nativeContext: options.nativeContext,
      });
      calls.push(["open", resource.path]);
    },
  };
  const router = createNativePreviewRouter(vscode, largePreview, {
    appendLine: (error) => errors.push(error),
  });
  const waitFor = async (expected) => {
    for (let n = 0; n < 50 && calls.length < expected; n++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(errors, []);
    assert.equal(calls.length, expected);
  };
  try {
    assert.equal(
      router.onNativeRender([], {
        currentDocument: small.uri,
        resourceProvider: { state: { line: 18.5 } },
      }),
      false,
    );
    assert.equal(router.sourceForTab(tabs[0]).document, small);
    assert.equal(router.sourceForTab(tabs[0]).line, 18.5);
    await waitFor(1);
    assert.deepEqual(calls, [["open", "/large.md"]]);
    allFiles = true;
    configurationChanged();
    await waitFor(2);
    assert.deepEqual(calls.at(-1), ["open", "/small.md"]);
    allFiles = false;
    configurationChanged();
    await waitFor(3);
    assert.deepEqual(calls.at(-1), ["restore", "/small.md"]);
    assert.equal(tabs[1].input.viewType, "Markdown-PMP.largePreview");
    assert.equal(group.activeTab, tabs[0], "Keep the originally focused tab");
  } finally {
    router.dispose();
  }
});

test("Preview entry points keep VS Code's commands and add no keyboard bindings", () => {
  assert.deepEqual(pkg.contributes.keybindings || [], []);
  assert.ok(
    !pkg.contributes.commands.some((command) =>
      /openLargePreview|findInPreview/.test(command.command),
    ),
  );
  assert.ok(
    !pkg.contributes.menus["editor/title"].some((item) =>
      /openLargePreview/.test(item.command),
    ),
  );
  assert.equal(
    pkg.contributes.configuration.properties[
      "Markdown-PMP.largePreview.enabled"
    ].default,
    true,
  );
  assert.equal(pkg.contributes.customEditors[0].priority, "option");
});
