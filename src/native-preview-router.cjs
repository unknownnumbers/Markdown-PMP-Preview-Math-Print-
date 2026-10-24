"use strict";
const path = require("node:path");
const { getSettings, affectsSettings } = require("./settings.cjs");

const NATIVE_EDITOR = "vscode.markdown.preview.editor";
function nativeTabKind(vscode, tab) {
  const input = tab.input;
  if (
    input instanceof vscode.TabInputCustom &&
    input.viewType === NATIVE_EDITOR
  )
    return "custom";
  if (
    input instanceof vscode.TabInputWebview &&
    /(?:^|-)markdown\.preview$/.test(input.viewType)
  )
    return "webview";
}
function findNativeTab(vscode, uri, known) {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  if (known && tabs.includes(known) && nativeTabKind(vscode, known))
    return known;
  const name = path.posix.basename(uri.path);
  const candidates = tabs.filter((tab) => {
    const kind = nativeTabKind(vscode, tab);
    return kind === "custom"
      ? tab.input.uri.toString() === uri.toString()
      : kind === "webview" && tab.label.endsWith(name);
  });
  const active = vscode.window.tabGroups.activeTabGroup.activeTab;
  return candidates.includes(active)
    ? active
    : candidates.length === 1
      ? candidates[0]
      : undefined;
}

function createNativePreviewRouter(vscode, largePreview, log) {
  const providers = new WeakMap(),
    bindings = new Map(),
    pending = new Map(),
    awaitingTabs = new Map();
  const failed = new WeakSet();
  let timer,
    disposed = false;
  const enabled = () => getSettings(vscode).get("largePreview.enabled", true);
  const live = (tab) =>
    vscode.window.tabGroups.all.some((group) => group.tabs.includes(tab)) &&
    nativeTabKind(vscode, tab);
  const report = (error) => log.appendLine(error.stack || String(error));
  async function replaceCustomEditor(tab, uri, from, to) {
    const focused = vscode.window.tabGroups.activeTabGroup.activeTab;
    await vscode.commands.executeCommand("vscode.openWith", uri, from, {
      viewColumn: tab.group.viewColumn,
      preserveFocus: false,
      preview: false,
    });
    // Reopening replaces the editor while keeping the shared text working copy.
    // Opening another editor and closing this one can prompt to discard changes.
    await vscode.commands.executeCommand("reopenActiveEditorWith", to);
    if (focused === tab || !focused?.group.tabs.includes(focused)) return;
    if (vscode.window.tabGroups.activeTabGroup !== focused.group) {
      await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup",
      );
      const index = vscode.window.tabGroups.all.indexOf(focused.group);
      for (let i = 0; i < index; i++)
        await vscode.commands.executeCommand("workbench.action.focusNextGroup");
    }
    await vscode.commands.executeCommand(
      "workbench.action.openEditorAtIndex",
      focused.group.tabs.indexOf(focused),
    );
  }
  function enqueue(binding) {
    providers.set(binding.provider, binding.tab);
    bindings.set(binding.tab, binding);
    pending.set(binding.tab, binding);
    timer ??= setTimeout(() => {
      void flush().catch(report);
    }, 0);
  }
  function bindAwaitingTabs() {
    for (const [provider, request] of awaitingTabs) {
      const tab = findNativeTab(vscode, request.uri);
      if (!tab) continue;
      clearTimeout(request.expiry);
      awaitingTabs.delete(provider);
      enqueue({ ...request, tab });
    }
  }
  async function flush() {
    timer = undefined;
    const requests = [...pending.values()];
    pending.clear();
    for (const binding of requests) {
      if (
        disposed ||
        !enabled() ||
        !live(binding.tab) ||
        bindings.get(binding.tab) !== binding
      )
        continue;
      try {
        await largePreview.openNative(
          binding.uri,
          {
            viewColumn: binding.tab.group.viewColumn,
            initialLine: binding.provider.state?.line,
            fragment: binding.provider.state?.fragment,
            sourceColumn: binding.provider.state?.resourceColumn,
            preserveFocus:
              binding.tab !== vscode.window.tabGroups.activeTabGroup.activeTab,
            nativeContext: true,
          },
          nativeTabKind(vscode, binding.tab) === "custom"
            ? () =>
                replaceCustomEditor(
                  binding.tab,
                  binding.uri,
                  NATIVE_EDITOR,
                  largePreview.viewType,
                )
            : undefined,
        );
        // openWith can replace a custom editor tab in place. Close only an
        // original native tab that still exists after the PMP editor is ready.
        if (live(binding.tab) && bindings.get(binding.tab) === binding)
          await vscode.window.tabGroups.close(binding.tab, true);
      } catch (error) {
        report(error);
        // A failed handoff must leave a normal native render on the next refresh.
        failed.add(binding.provider);
        if (live(binding.tab))
          await vscode.commands.executeCommand("markdown.preview.refresh");
      }
    }
  }
  function onNativeRender(_tokens, env) {
    const uri = env.currentDocument,
      provider = env.resourceProvider;
    // API rendering and editor tokenization have no preview resource provider.
    if (
      !uri?.scheme ||
      !provider ||
      provider.isDiffView ||
      failed.has(provider)
    )
      return false;
    const tab = findNativeTab(vscode, uri, providers.get(provider));
    const doc = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString(),
    );
    if (!enabled() || !doc || !largePreview.isLargeDocument(doc)) {
      if (tab) {
        providers.set(provider, tab);
        bindings.set(tab, { tab, uri, provider });
        pending.delete(tab);
      }
      return false;
    }
    if (tab) enqueue({ tab, uri, provider });
    else if (!awaitingTabs.has(provider)) {
      // The renderer can run before VS Code publishes the new tab. Complete
      // the handoff from the tab event, rather than relying on event ordering.
      const request = { uri, provider };
      request.expiry = setTimeout(() => {
        if (!awaitingTabs.delete(provider)) return;
        failed.add(provider);
        void vscode.commands
          .executeCommand("markdown.preview.refresh")
          .then(undefined, report);
      }, 5000);
      awaitingTabs.set(provider, request);
    }
    return true;
  }
  async function restoreNative(state) {
    if (state.restoring || state.disposed) return;
    state.restoring = true;
    const originalTab = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find(
        (tab) =>
          tab.group.viewColumn === state.panel.viewColumn &&
          tab.input instanceof vscode.TabInputCustom &&
          tab.input.viewType === largePreview.viewType &&
          tab.input.uri.toString() === state.document.uri.toString(),
      );
    try {
      if (originalTab)
        await replaceCustomEditor(
          originalTab,
          state.document.uri,
          largePreview.viewType,
          NATIVE_EDITOR,
        );
    } catch (error) {
      report(error);
    } finally {
      state.restoring = false;
    }
  }
  const subscriptions = [
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of [...event.closed, ...event.changed])
        if (!live(tab)) {
          bindings.delete(tab);
          pending.delete(tab);
        }
      bindAwaitingTabs();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (affectsSettings(event) && !enabled()) {
        pending.clear();
        for (const request of awaitingTabs.values())
          clearTimeout(request.expiry);
        awaitingTabs.clear();
        void (async () => {
          for (const state of largePreview.previews)
            if (state.nativeContext) await restoreNative(state);
        })().catch(report);
      }
    }),
  ];
  return {
    onNativeRender,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      pending.clear();
      for (const request of awaitingTabs.values()) clearTimeout(request.expiry);
      awaitingTabs.clear();
      bindings.clear();
      for (const subscription of subscriptions) subscription.dispose();
    },
  };
}
module.exports = { createNativePreviewRouter, findNativeTab, nativeTabKind };
