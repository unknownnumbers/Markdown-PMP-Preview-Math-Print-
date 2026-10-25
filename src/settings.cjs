"use strict";

const SETTINGS_SECTION = "Markdown-PMP";
const LEGACY_SECTION = "inkpage";
const explicitValues = [
  "globalValue",
  "workspaceValue",
  "workspaceFolderValue",
  "globalLanguageValue",
  "workspaceLanguageValue",
  "workspaceFolderLanguageValue",
];

function hasExplicitValue(inspection) {
  return explicitValues.some((key) => inspection?.[key] !== undefined);
}

function getSettings(vscode, resource) {
  const current = vscode.workspace.getConfiguration(SETTINGS_SECTION, resource);
  const legacy = vscode.workspace.getConfiguration(LEGACY_SECTION, resource);
  const source = (key) =>
    hasExplicitValue(current.inspect(key)) ||
    !hasExplicitValue(legacy.inspect(key))
      ? current
      : legacy;
  return {
    get: (key, fallback) => source(key).get(key, fallback),
    update(key, value) {
      const inspection = source(key).inspect(key);
      const target =
        inspection?.workspaceFolderValue !== undefined
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : inspection?.workspaceValue !== undefined
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
      return current.update(key, value, target);
    },
  };
}

function affectsSettings(event) {
  return [SETTINGS_SECTION, LEGACY_SECTION].some((section) =>
    event.affectsConfiguration(section),
  );
}

function getPreviewMenuSuppression(vscode, native = false) {
  const key = native
    ? "nativePreview.suppressAltMenus"
    : "preview.suppressAltMenus";
  const previous = native
    ? "nativePreview.suppressAltSMenu"
    : "largePreview.suppressAltSMenu";
  const current = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  if (hasExplicitValue(current.inspect(key))) return current.get(key, true);
  if (hasExplicitValue(current.inspect(previous)))
    return current.get(previous, true);
  return current.get(key, true);
}

module.exports = {
  SETTINGS_SECTION,
  getSettings,
  affectsSettings,
  getPreviewMenuSuppression,
};
