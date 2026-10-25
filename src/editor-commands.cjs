"use strict";
const path = require("node:path");
const { t } = require("./i18n.cjs");

function createPdfBesideCommand(vscode, exportPdf) {
  const pending = new Map();
  return async () => {
    let doc = vscode.window.activeTextEditor?.document;
    if (!doc || doc.languageId !== "markdown") return;
    if (doc.isUntitled) {
      await vscode.commands.executeCommand("workbench.action.files.save");
      doc = vscode.window.activeTextEditor?.document;
      if (!doc || doc.isUntitled || doc.languageId !== "markdown") return;
    }
    if (doc.uri.scheme !== "file") {
      void vscode.window.showErrorMessage(
        t("Save this Markdown document locally before exporting beside it."),
      );
      return;
    }
    const key = doc.uri.toString();
    const current = pending.get(key);
    if (current) {
      current.again = true;
      return current.promise;
    }
    const output = doc.uri.with({
      path: path.posix.join(
        path.posix.dirname(doc.uri.path),
        `${path.posix.parse(doc.uri.path).name}_md.pdf`,
      ),
      query: "",
      fragment: "",
    });
    const request = { again: false };
    pending.set(key, request);
    request.promise = (async () => {
      let result;
      do {
        request.again = false;
        result = await exportPdf(doc.uri, output);
      } while (request.again && result);
      return result;
    })().finally(() => pending.delete(key));
    return request.promise;
  };
}

module.exports = { createPdfBesideCommand };
