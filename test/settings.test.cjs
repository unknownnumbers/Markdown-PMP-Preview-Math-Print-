"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  SETTINGS_SECTION,
  getSettings,
  affectsSettings,
} = require("../src/settings.cjs");
const properties =
  require("../package.json").contributes.configuration.properties;

function fixture(current = {}, legacy = {}) {
  const writes = [];
  const resource = { fsPath: "example.md" };
  const vscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: {
      getConfiguration(section, scope) {
        assert.equal(scope, resource);
        assert.ok([SETTINGS_SECTION, "inkpage"].includes(section));
        const values = section === SETTINGS_SECTION ? current : legacy;
        return {
          inspect: (key) => values[key],
          get(key, fallback) {
            const value = values[key];
            return (
              value?.workspaceFolderValue ??
              value?.workspaceValue ??
              value?.globalValue ??
              value?.defaultValue ??
              fallback
            );
          },
          async update(key, value, target) {
            writes.push({ section, key, value, target });
          },
        };
      },
    },
  };
  return { settings: getSettings(vscode, resource), writes };
}

test("Only Markdown-PMP settings are contributed, with the original defaults and scopes", () => {
  assert.equal(SETTINGS_SECTION, "Markdown-PMP");
  assert.ok(
    Object.keys(properties).every((key) => key.startsWith("Markdown-PMP.")),
  );
  assert.equal(properties["Markdown-PMP.theme"].default, "default");
  assert.equal(properties["Markdown-PMP.math.preview.enabled"].default, true);
  assert.equal(properties["Markdown-PMP.math.export.enabled"].default, true);
  assert.equal(properties["Markdown-PMP.largePreview.enabled"].default, true);
  assert.equal(properties["Markdown-PMP.largePreview.enabled"].scope, "window");
  assert.equal(
    properties["Markdown-PMP.browserPath"].scope,
    "machine-overridable",
  );
  assert.equal(properties["Markdown-PMP.fontSize"].scope, "resource");
});

test("Explicit legacy settings survive the new schema defaults", () => {
  const { settings, writes } = fixture(
    {
      theme: { defaultValue: "default" },
      "math.preview.enabled": { defaultValue: true },
    },
    {
      theme: { globalValue: "purple" },
      "math.preview.enabled": { workspaceValue: false },
    },
  );
  assert.equal(settings.get("theme"), "purple");
  assert.equal(settings.get("math.preview.enabled"), false);
  assert.deepEqual(writes, []);
});

test("Explicit new values override legacy values even across scopes, including empty values", () => {
  for (const value of [false, 0, "", [], {}]) {
    const { settings } = fixture(
      { key: { globalValue: value } },
      { key: { workspaceFolderValue: "old value" } },
    );
    assert.deepEqual(settings.get("key", "fallback"), value);
  }
});

test("Fresh installations use current defaults and never read legacy defaults", () => {
  const { settings } = fixture(
    { theme: { defaultValue: "default" } },
    {
      theme: { defaultValue: "purple" },
      missing: { defaultValue: "old default" },
    },
  );
  assert.equal(settings.get("theme"), "default");
  assert.equal(settings.get("missing", "fallback"), "fallback");
});

test("Saving writes only the new namespace and preserves the applicable explicit scope", async () => {
  for (const [field, target] of [
    ["globalValue", 1],
    ["workspaceValue", 2],
    ["workspaceFolderValue", 3],
  ]) {
    for (const legacy of [true, false]) {
      const values = { theme: { [field]: "purple" } };
      const { settings, writes } = fixture(
        legacy ? {} : values,
        legacy ? values : {},
      );
      await settings.update("theme", "blue");
      assert.deepEqual(writes, [
        { section: "Markdown-PMP", key: "theme", value: "blue", target },
      ]);
    }
  }
  const { settings, writes } = fixture(
    { theme: { globalValue: "purple" } },
    { theme: { workspaceValue: "redblue" } },
  );
  await settings.update("theme", "blue");
  assert.equal(writes[0].target, 1);
  const fresh = fixture();
  await fresh.settings.update("theme", "purple");
  assert.equal(fresh.writes[0].target, 1);
});

test("Both canonical and legacy setting changes refresh the preview", () => {
  for (const changed of ["Markdown-PMP", "inkpage"])
    assert.equal(
      affectsSettings({
        affectsConfiguration: (section) => section === changed,
      }),
      true,
    );
  assert.equal(
    affectsSettings({ affectsConfiguration: (section) => section === "pmp" }),
    false,
  );
});
