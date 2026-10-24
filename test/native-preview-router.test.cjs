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
