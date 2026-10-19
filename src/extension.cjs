"use strict";
const vscode = require("vscode"),
  path = require("node:path");
const { t } = require("./i18n.cjs");
const { getSettings, affectsSettings } = require("./settings.cjs");
const { PALETTES, normalizeOptions, variableCss } = require("./theme.cjs");
const { normalizeMath } = require("./math.cjs");
const { installPreview } = require("./preview.cjs");
const { renderDocument, checkAbort } = require("./render.cjs");
const { createPdf, createImages } = require("./pdf.cjs");
const { normalizeExport, layoutCss } = require("./export-options.cjs");
const {
  captureTheme,
  invalidateTheme,
  exportSettings,
} = require("./export-ui.cjs");
function readOptions(resource) {
  const c = getSettings(vscode, resource);
  return normalizeOptions({
    theme: getSettings(vscode).get("theme", "default"),
    fontSize: c.get("fontSize"),
    lineHeight: c.get("lineHeight"),
    maxWidth: c.get("maxWidth"),
    pdfFontSize: c.get("pdf.fontSize"),
  });
}
function readMath(kind) {
  const c = getSettings(vscode);
  return normalizeMath({
    enabled: c.get(`math.${kind}.enabled`, true),
    delimiters: c.get("math.delimiters", ["dollars", "brackets"]),
    macros: c.get("math.macros", {}),
    outerspace: c.get("math.outerspace", false),
  });
}
function readExport(resource) {
  const c = getSettings(vscode, resource);
  return normalizeExport({
    paper: c.get("pdf.paper"),
    width: c.get("pdf.width"),
    height: c.get("pdf.height"),
    landscape: c.get("pdf.landscape"),
    margins: c.get("pdf.margins"),
    fontSize: c.get("pdf.fontSize"),
    scale: c.get("pdf.scale"),
    pageRanges: c.get("pdf.pageRanges"),
    header: c.get("pdf.header"),
    footer: c.get("pdf.footer"),
    imageWidth: c.get("image.width"),
    imageScale: c.get("image.scale"),
    jpegQuality: c.get("image.jpegQuality"),
  });
}
async function saveExport(resource, o) {
  const c = getSettings(vscode, resource),
    entries = {
      ...Object.fromEntries(
        [
          "paper",
          "width",
          "height",
          "landscape",
          "margins",
          "fontSize",
          "scale",
          "pageRanges",
          "header",
          "footer",
        ].map((k) => [`pdf.${k}`, o[k]]),
      ),
      "image.width": o.imageWidth,
      "image.scale": o.imageScale,
      "image.jpegQuality": o.jpegQuality,
    };
  for (const [key, value] of Object.entries(entries))
    await c.update(key, value);
}
function activate(context) {
  const log = vscode.window.createOutputChannel(t("Markdown PMP")),
    status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      80,
    );
  let lastMarkdown;
  let warnedConflict = false;
  function checkMathConflict() {
    if (
      warnedConflict ||
      !getSettings(vscode).get("math.preview.enabled", true)
    )
      return;
    const mdmath = vscode.extensions.getExtension("goessner.mdmath");
    const allInOne =
      vscode.extensions.getExtension("yzhang.markdown-all-in-one") &&
      vscode.workspace
        .getConfiguration("markdown")
        .get("extension.math.enabled", true);
    if (!mdmath && !allInOne) return;
    warnedConflict = true;
    void vscode.window
      .showWarningMessage(
        t(
          "Another math preview provider is enabled: {0}. Keep only one enabled to avoid parsing and font conflicts.",
          mdmath ? "mdmath" : t("Markdown All in One math"),
        ),
        t("View Extension"),
        t("Disable PMP Math Preview"),
      )
      .then((action) => {
        if (action === t("View Extension"))
          return vscode.commands.executeCommand(
            "workbench.extensions.search",
            mdmath ? "@id:goessner.mdmath" : "@id:yzhang.markdown-all-in-one",
          );
        if (action === t("Disable PMP Math Preview")) {
          return getSettings(vscode).update("math.preview.enabled", false);
        }
      });
  }
  status.name = t("Markdown PMP");
  status.command = "Markdown-PMP.selectTheme";
  function updateStatus() {
    const e = vscode.window.activeTextEditor,
      p = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (
      e?.document.languageId === "markdown" ||
      (lastMarkdown &&
        p instanceof vscode.TabInputWebview &&
        /markdown/i.test(p.viewType))
    ) {
      status.text = `$(book) ${PALETTES[readOptions().theme].name}`;
      status.tooltip = t(
        "Markdown PMP: select the preview theme for this window",
      );
      status.show();
    } else status.hide();
  }
  const remember = (e) => {
    if (e?.document.languageId === "markdown") lastMarkdown = e.document.uri;
    updateStatus();
  };
  async function selectTheme() {
    const current = readOptions().theme,
      p = await vscode.window.showQuickPick(
        Object.entries(PALETTES).map(([id, x]) => ({
          label: x.name,
          description: current === id ? t("Current") : undefined,
          id,
        })),
        {
          title: t("Markdown PMP"),
          placeHolder: t("Select the preview theme for this window"),
        },
      );
    if (!p) return;
    await getSettings(vscode).update("theme", p.id);
  }
  async function resolveDocument(arg) {
    if (arg?.scheme) return vscode.workspace.openTextDocument(arg);
    if (vscode.window.activeTextEditor?.document.languageId === "markdown")
      return vscode.window.activeTextEditor.document;
    if (lastMarkdown) return vscode.workspace.openTextDocument(lastMarkdown);
    const docs = vscode.workspace.textDocuments.filter(
      (x) => x.languageId === "markdown" && !x.isClosed,
    );
    if (docs.length === 1) return docs[0];
    if (docs.length) {
      const p = await vscode.window.showQuickPick(
        docs.map((document) => ({
          label: path.basename(document.fileName),
          description: vscode.workspace.asRelativePath(document.uri),
          document,
        })),
        { placeHolder: t("Select a document to export") },
      );
      return p?.document;
    }
    throw new Error(t("Open a Markdown document first."));
  }
  async function exportFile(format, arg, destinationArg, temporary) {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showErrorMessage(
        t("Trust this workspace before exporting."),
      );
      return;
    }
    try {
      const doc = await resolveDocument(arg);
      if (!doc) return;
      if (doc.languageId !== "markdown")
        throw new Error(t("Select a Markdown document."));
      const options = readOptions(doc.uri),
        settings = normalizeExport(temporary || readExport(doc.uri)),
        title =
          path
            .basename(doc.fileName)
            .replace(/\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i, "") || "Markdown";
      const folder = doc.isUntitled
        ? vscode.workspace.workspaceFolders?.[0]?.uri ||
          vscode.Uri.file(require("node:os").homedir())
        : vscode.Uri.joinPath(doc.uri, "..");
      const output = destinationArg?.scheme
        ? destinationArg
        : await vscode.window.showSaveDialog({
            title: t("Export {0} · Markdown PMP", format.toUpperCase()),
            defaultUri: vscode.Uri.joinPath(folder, `${title}.${format}`),
            filters: { [format.toUpperCase()]: [format] },
          });
      if (!output) return;
      const a = output.toString(),
        b = doc.uri.toString();
      if (
        process.platform === "win32"
          ? a.toLowerCase() === b.toLowerCase()
          : a === b
      )
        throw new Error(
          t("The export cannot overwrite the Markdown source file."),
        );
      const source = doc.getText(),
        markdown = vscode.workspace.getConfiguration("markdown", doc.uri),
        config = getSettings(vscode, doc.uri);
      let outputs = [],
        warnings = [];
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t("Markdown PMP: exporting {0}", format.toUpperCase()),
          cancellable: true,
        },
        async (progress, token) => {
          const controller = new AbortController(),
            cancel = token.onCancellationRequested(() => controller.abort());
          try {
            const snapshot =
              options.theme === "default"
                ? await captureTheme(doc.uri, controller.signal)
                : undefined;
            progress.report({
              message: t("Preparing math, fonts and local images…"),
            });
            const rendered = await renderDocument({
              markdown: source,
              options,
              extensionPath: context.extensionPath,
              sourceUri: doc.uri.toString(),
              workspaceRoot: vscode.workspace
                .getWorkspaceFolder(doc.uri)
                ?.uri.toString(),
              outputPath: output.scheme === "file" ? output.fsPath : undefined,
              fontMode: "embedded",
              title,
              snapshot,
              layoutCss: layoutCss(settings, format, snapshot),
              markdownOptions: {
                breaks: markdown.get("preview.breaks", false),
                linkify: markdown.get("preview.linkify", true),
                typographer: markdown.get("preview.typographer", false),
                frontMatter: markdown.get("preview.frontMatter", "table"),
                math: readMath("export"),
              },
              readAsset: (uri) =>
                vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
              signal: controller.signal,
            });
            warnings = rendered.warnings;
            const browser = {
              browserPath:
                config.get("browserPath", "") ||
                config.get("pdf.browserPath", ""),
              signal: controller.signal,
              options: settings,
              title,
              foreground: snapshot?.colors["--vscode-editor-foreground"],
              onProgress: (message) => progress.report({ message }),
            };
            const bytes =
              format === "html"
                ? [Buffer.from(rendered.html)]
                : format === "pdf"
                  ? [await createPdf(rendered.html, browser)]
                  : await createImages(rendered.html, { ...browser, format });
            checkAbort(controller.signal);
            outputs = bytes.map((_, i) =>
              bytes.length === 1
                ? output
                : output.with({
                    path:
                      output.path.replace(/\.[^.\/]+$/, "") +
                      `_${String(i + 1).padStart(2, "0")}.${format}`,
                  }),
            );
            if (outputs.length > 1) {
              let existing = 0;
              for (const uri of outputs) {
                try {
                  await vscode.workspace.fs.stat(uri);
                  existing++;
                } catch {}
              }
              if (
                existing &&
                (await vscode.window.showWarningMessage(
                  t(
                    "{0} numbered image files already exist. Overwrite them?",
                    existing,
                  ),
                  { modal: true },
                  t("Overwrite"),
                )) !== t("Overwrite")
              )
                throw Object.assign(new Error(t("Export cancelled.")), {
                  name: "AbortError",
                });
            }
            checkAbort(controller.signal);
            for (let i = 0; i < outputs.length; i++)
              await vscode.workspace.fs.writeFile(outputs[i], bytes[i]);
            log.appendLine(
              t(
                "Exported {0} ({1}): {2}",
                format.toUpperCase(),
                PALETTES[options.theme].name,
                outputs.map((x) => x.toString(true)).join(", "),
              ),
            );
          } finally {
            cancel.dispose();
          }
        },
      );
      const extra =
        format === "html" && warnings.length ? " " + warnings.join(" ") : "";
      void vscode.window
        .showInformationMessage(
          (outputs.length > 1
            ? t(
                "{0} exported as {1} numbered images.",
                format.toUpperCase(),
                outputs.length,
              )
            : t("{0} exported.", format.toUpperCase())) + extra,
          t("Open File"),
          t("Reveal in Folder"),
        )
        .then((action) =>
          action === t("Open File")
            ? vscode.env.openExternal(outputs[0])
            : action === t("Reveal in Folder")
              ? vscode.commands.executeCommand("revealFileInOS", outputs[0])
              : undefined,
        )
        .then(undefined, (e) => log.appendLine(e.message));
      return outputs.length === 1 ? outputs[0] : outputs;
    } catch (error) {
      if (error.name === "AbortError") return;
      log.appendLine(error.stack || String(error));
      void vscode.window
        .showErrorMessage(
          t("Markdown PMP export failed: {0}", error.message),
          t("Show Log"),
        )
        .then((action) => {
          if (action) log.show();
        });
    }
  }
  async function withSettings(arg) {
    const doc = await resolveDocument(arg);
    if (!doc) return;
    const format = await vscode.window.showQuickPick(
      ["PDF", "HTML", "PNG", "JPEG"],
      {
        title: t("Export Settings"),
        placeHolder: t("Select an export format"),
      },
    );
    if (!format) return;
    const result = await exportSettings(
      format.toLowerCase(),
      readExport(doc.uri),
      PALETTES[readOptions().theme].name,
    );
    if (!result) return;
    if (result.save) await saveExport(doc.uri, result.options);
    return exportFile(format.toLowerCase(), doc.uri, undefined, result.options);
  }
  async function migrateMath() {
    try {
      const old = vscode.workspace.getConfiguration("mdmath"),
        c = getSettings(vscode);
      let macros = old.get("macros", {});
      const file = old.get("macroFile", "");
      if (file)
        macros = JSON.parse(
          Buffer.from(
            await vscode.workspace.fs.readFile(vscode.Uri.file(file)),
          ).toString("utf8"),
        );
      const math = normalizeMath({
        macros,
        delimiters: old.get("delimiters") || c.get("math.delimiters"),
      });
      for (const [key, value] of Object.entries({
        "math.macros": math.macros,
        "math.delimiters": math.delimiters,
        "math.outerspace": old.get("outerspace", false),
      }))
        await c.update(key, value);
      void vscode.window.showInformationMessage(
        t(
          "Imported mdmath delimiters and macros. Macro-file contents are saved in settings; the original file is no longer required.",
        ),
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        t("Could not import math settings: {0}", error.message),
      );
    }
  }
  remember(vscode.window.activeTextEditor);
  context.subscriptions.push(
    log,
    status,
    vscode.commands.registerCommand("Markdown-PMP.selectTheme", selectTheme),
    vscode.commands.registerCommand(
      "Markdown-PMP.exportWithSettings",
      withSettings,
    ),
    vscode.commands.registerCommand(
      "Markdown-PMP.migrateMdmathSettings",
      migrateMath,
    ),
    vscode.commands.registerCommand("Markdown-PMP.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${context.extension.id}`,
      ),
    ),
    vscode.commands.registerCommand("Markdown-PMP.openSample", async () => {
      const uri = vscode.Uri.joinPath(
        context.extensionUri,
        "examples",
        /^zh-(?:tw|tc|hant)$/i.test(vscode.env.language)
          ? "formulas.zh-TC.md"
          : /^zh-(?:cn|sc|hans)$/i.test(vscode.env.language)
            ? "formulas.zh-SC.md"
            : "formulas.en.md",
      );
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(uri),
      );
      await vscode.commands.executeCommand("markdown.showPreviewToSide", uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(remember),
    vscode.window.tabGroups.onDidChangeTabs(updateStatus),
    vscode.window.onDidChangeActiveColorTheme(invalidateTheme),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        ["workbench", "markdown", "editor"].some((x) =>
          event.affectsConfiguration(x),
        )
      )
        invalidateTheme();
      if (affectsSettings(event)) {
        updateStatus();
        void vscode.commands
          .executeCommand("markdown.preview.refresh")
          .then(undefined, (e) => log.appendLine(e.message));
      }
    }),
  );
  for (const format of ["html", "pdf", "png", "jpeg"])
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "Markdown-PMP.export" + format[0].toUpperCase() + format.slice(1),
        (uri, destination, temporary) =>
          exportFile(format, uri, destination, temporary),
      ),
    );
  return {
    extendMarkdownIt(md) {
      checkMathConflict();
      return installPreview(
        md,
        readOptions,
        () => readMath("preview"),
        variableCss,
        (e) => log.appendLine(e.message),
      );
    },
  };
}
module.exports = { activate, readOptions, readMath, readExport };
