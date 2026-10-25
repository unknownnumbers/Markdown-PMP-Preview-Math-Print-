"use strict";
const path = require("node:path");
const { affectsSettings } = require("./settings.cjs");

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
    awaitingTabs = new Map(),
    opening = new Set();
  const failed = new WeakSet();
  let timer,
    disposed = false;
  const documentFor = (uri) =>
    vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString(),
    );
  const shouldRoute = (uri) => {
    const doc = documentFor(uri);
    return doc && largePreview.shouldUsePmp(doc);
  };
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
    if (binding.provider) providers.set(binding.provider, binding.tab);
    if (opening.has(binding.tab)) {
      const current = bindings.get(binding.tab);
      if (current && current.uri.toString() === binding.uri.toString()) {
        current.provider ||= binding.provider;
        return;
      }
    }
    bindings.set(binding.tab, binding);
    pending.set(binding.tab, binding);
    timer ??= setTimeout(() => {
      void flush().catch(report);
    }, 0);
  }
  function routeEarly(tab) {
    if (!nativeTabKind(vscode, tab) || pending.has(tab) || opening.has(tab))
      return;
    const documents = vscode.workspace.textDocuments.filter((document) =>
      tab.input instanceof vscode.TabInputCustom
        ? document.uri.toString() === tab.input.uri.toString()
        : tab.label.endsWith(path.posix.basename(document.uri.path)),
    );
    // Dynamic preview tabs do not expose a URI. Ambiguous filenames wait for
    // the renderer's document metadata; a known file can open immediately.
    if (documents.length !== 1 || !largePreview.shouldUsePmp(documents[0]))
      return;
    const document = documents[0];
    const editor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document === document,
    );
    const start = editor?.visibleRanges[0]?.start;
    const remembered = largePreview.sourcePosition(document.uri);
    enqueue({
      tab,
      uri: document.uri,
      initialLine: start
        ? start.line +
          start.character / (document.lineAt(start.line).text.length + 2)
        : remembered?.line || 0,
      sourceColumn:
        editor?.viewColumn ||
        vscode.window.activeTextEditor?.viewColumn ||
        remembered?.column ||
        vscode.ViewColumn.One,
      startedAt: performance.now(),
    });
  }
  function routeExisting() {
    for (const group of vscode.window.tabGroups.all)
      for (const tab of group.tabs) routeEarly(tab);
  }
  function bindAwaitingTabs() {
    for (const [provider, request] of awaitingTabs) {
      const tab = findNativeTab(vscode, request.uri);
      if (!tab) continue;
      clearTimeout(request.expiry);
      awaitingTabs.delete(provider);
      if (request.route === false) {
        providers.set(provider, tab);
        bindings.set(tab, { ...request, tab });
      } else enqueue({ ...request, tab });
    }
  }
  async function flush() {
    timer = undefined;
    const requests = [...pending.values()];
    pending.clear();
    for (const binding of requests) {
      if (
        disposed ||
        !shouldRoute(binding.uri) ||
        !live(binding.tab) ||
        bindings.get(binding.tab) !== binding
      )
        continue;
      opening.add(binding.tab);
      try {
        await largePreview.openNative(
          binding.uri,
          {
            viewColumn: binding.tab.group.viewColumn,
            initialLine: binding.provider?.state?.line ?? binding.initialLine,
            fragment: binding.provider?.state?.fragment,
            sourceColumn:
              binding.provider?.state?.resourceColumn ?? binding.sourceColumn,
            startedAt: binding.startedAt,
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
        if (binding.provider) failed.add(binding.provider);
        if (live(binding.tab))
          await vscode.commands.executeCommand("markdown.preview.refresh");
      } finally {
        opening.delete(binding.tab);
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
    if (!shouldRoute(uri)) {
      if (tab) {
        providers.set(provider, tab);
        bindings.set(tab, { tab, uri, provider });
        pending.delete(tab);
      } else if (!awaitingTabs.has(provider)) {
        const request = { uri, provider, route: false };
        request.expiry = setTimeout(() => awaitingTabs.delete(provider), 5000);
        awaitingTabs.set(provider, request);
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
      for (const tab of event.opened) routeEarly(tab);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (affectsSettings(event)) {
        for (const [tab, binding] of pending)
          if (!shouldRoute(binding.uri)) pending.delete(tab);
        for (const [provider, request] of awaitingTabs) {
          if (shouldRoute(request.uri)) continue;
          clearTimeout(request.expiry);
          awaitingTabs.delete(provider);
        }
        routeExisting();
        void (async () => {
          for (const state of largePreview.previews)
            if (
              state.nativeContext &&
              !largePreview.shouldUsePmp(state.document)
            )
              await restoreNative(state);
        })().catch(report);
      }
    }),
  ];
  const startup = setTimeout(routeExisting, 0);
  return {
    onNativeRender,
    sourceForTab(tab) {
      const binding = bindings.get(tab);
      const document = binding && documentFor(binding.uri);
      if (!document) return;
      return {
        document,
        line: binding.provider?.state?.line ?? binding.initialLine ?? 0,
      };
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(startup);
      pending.clear();
      for (const request of awaitingTabs.values()) clearTimeout(request.expiry);
      awaitingTabs.clear();
      bindings.clear();
      for (const subscription of subscriptions) subscription.dispose();
    },
  };
}
module.exports = { createNativePreviewRouter, findNativeTab, nativeTabKind };
