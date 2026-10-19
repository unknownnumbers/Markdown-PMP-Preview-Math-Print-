"use strict";
const vscode = require("vscode");
const crypto = require("node:crypto");
const { t } = require("./i18n.cjs");
const { normalizeExport, PAPERS } = require("./export-options.cjs");
const { abortError } = require("./render.cjs");
const escape = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function collectThemeScript() {
  return `const computed=getComputedStyle(document.documentElement), colors={};for(const key of Array.from(computed)){if(key.startsWith('--vscode-')){const value=computed.getPropertyValue(key).trim();if(CSS.supports('color',value))colors[key]=value;}}return{colors,kind:Array.from(document.body.classList).filter(x=>/^vscode-(light|dark|high-contrast)/.test(x)).join(' '),codeFontFamily:computed.getPropertyValue('--vscode-editor-font-family').trim()};`;
}
function fontOptions(resource, theme) {
  const md = vscode.workspace.getConfiguration("markdown", resource);
  return {
    ...theme,
    fontFamily:
      md.get("preview.fontFamily") ||
      '-apple-system,BlinkMacSystemFont,"Segoe WPC","Segoe UI",system-ui,Ubuntu,"Droid Sans",sans-serif',
    fontSize: md.get("preview.fontSize", 14),
    lineHeight: md.get("preview.lineHeight", 1.6),
    codeFontFamily:
      theme.codeFontFamily ||
      vscode.workspace
        .getConfiguration("editor", resource)
        .get("fontFamily", "monospace"),
  };
}
let themeCache;
function invalidateTheme() {
  themeCache = undefined;
}
async function captureTheme(resource, signal) {
  if (themeCache) return fontOptions(resource, themeCache);
  if (signal?.aborted) throw abortError();
  const panel = vscode.window.createWebviewPanel(
    "Markdown-PMP.captureTheme",
    t("Markdown PMP · Preparing Export"),
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
    { enableScripts: true, localResourceRoots: [] },
  );
  const nonce = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      listener.dispose();
      closed.dispose();
      panel.dispose();
      error ? reject(error) : resolve(value);
    };
    const aborted = () => finish(abortError());
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            t("Reading the current theme timed out. Try exporting again."),
          ),
        ),
      15000,
    );
    const listener = panel.webview.onDidReceiveMessage((message) => {
      if (
        message.type === "theme" &&
        message.data?.colors?.["--vscode-editor-background"]
      ) {
        themeCache = message.data;
        finish(null, fontOptions(resource, themeCache));
      }
    });
    const closed = panel.onDidDispose(() => finish(abortError()));
    signal?.addEventListener("abort", aborted, { once: true });
    panel.webview.html = `<!doctype html><html lang="${escape(vscode.env.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'nonce-${nonce}'"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);padding:24px}</style></head><body><p>${escape(t("Preparing Default export styles…"))}</p><script nonce="${nonce}">const api=acquireVsCodeApi();requestAnimationFrame(()=>requestAnimationFrame(()=>{const data=(()=>{${collectThemeScript()}})();api.postMessage({type:'theme',data})}));</script></body></html>`;
  });
}

async function exportSettings(format, defaults, theme) {
  const panel = vscode.window.createWebviewPanel(
    "Markdown-PMP.exportSettings",
    t("Markdown PMP · Export Settings"),
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  const nonce = crypto.randomBytes(16).toString("hex");
  const input = (key, label, value, type = "number", extra = 'step="any"') =>
    `<label>${escape(t(label))}<input name="${key}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  const checks = (key, title, values) =>
    `<fieldset><legend>${escape(t(title))}</legend>${[
      ["filename", "Filename"],
      ["date", "Date"],
      ["pageNumber", "Page number"],
    ]
      .map(
        ([id, label]) =>
          `<label class="check"><input type="checkbox" name="${key}" value="${id}" ${values.includes(id) ? "checked" : ""}>${escape(t(label))}</label>`,
      )
      .join("")}</fieldset>`;
  const pdf = `<label>${escape(t("Paper"))}<select name="paper">${[...Object.keys(PAPERS), "Custom"].map((x) => `<option value="${x}" ${defaults.paper === x ? "selected" : ""}>${x === "Custom" ? escape(t("Custom")) : x}</option>`).join("")}</select></label>${input("width", "Custom width (mm)", defaults.width)}${input("height", "Custom height (mm)", defaults.height)}<label class="check"><input type="checkbox" name="landscape" ${defaults.landscape ? "checked" : ""}>${escape(t("Landscape"))}</label>${["top", "right", "bottom", "left"].map((s, i) => input(s, ["Top margin (mm)", "Right margin (mm)", "Bottom margin (mm)", "Left margin (mm)"][i], defaults.margins[s])).join("")}${input("fontSize", "Body font size (pt)", defaults.fontSize, "number", 'step="0.5"')}${input("scale", "Scale (0.1–2)", defaults.scale, "number", 'step="0.1"')}${input("pageRanges", "Page ranges (empty for all)", defaults.pageRanges, "text", 'placeholder="1-5,8"')}${checks("header", "Header", defaults.header)}${checks("footer", "Footer", defaults.footer)}`;
  const image = `${input("imageWidth", "Layout width (px)", defaults.imageWidth)}${input("imageScale", "Resolution (1–3×)", defaults.imageScale, "number", 'step="0.5"')}${format === "jpeg" ? input("jpegQuality", "JPEG quality (1–100)", defaults.jpegQuality) : ""}<p>${escape(t("Very long articles are split into consecutively numbered images."))}</p>`;
  const data = JSON.stringify(defaults).replace(/</g, "\\u003c");
  return new Promise((resolve) => {
    let settled = false;
    const close = panel.onDidDispose(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    });
    panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "cancel") {
        panel.dispose();
        return;
      }
      if (message.type !== "export") return;
      try {
        const options = normalizeExport(message.options);
        settled = true;
        resolve({ options, save: message.save });
        close.dispose();
        panel.dispose();
      } catch (error) {
        void panel.webview.postMessage({
          type: "error",
          message: error.message,
        });
      }
    });
    panel.webview.html = `<!doctype html><html lang="${escape(vscode.env.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'nonce-${nonce}'"><style>body{font:14px/1.6 var(--vscode-font-family);color:var(--vscode-editor-foreground);padding:24px;max-width:760px;margin:auto}form{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:flex;flex-direction:column;gap:5px}.check{display:inline-flex;flex-direction:row;margin-right:14px;align-items:center}input,select{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:7px}fieldset,p,.actions{grid-column:1/-1}fieldset{border:1px solid var(--vscode-panel-border)}button{padding:8px 16px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;cursor:pointer;margin-right:10px}#error{color:var(--vscode-errorForeground);grid-column:1/-1}</style></head><body><h2>${escape(t("Export {0}", format.toUpperCase()))}</h2><p>${escape(t("Theme: {0}. These temporary settings apply only to this export.", theme))}</p><form id="form">${format === "pdf" ? pdf : ["png", "jpeg"].includes(format) ? image : `<p>${escape(t("HTML embeds styles and local images. PMP themes include body fonts; Default uses system fonts."))}</p>`}<div id="error" role="alert"></div><div class="actions"><button type="submit">${escape(t("Export Once"))}</button><button type="submit" name="save">${escape(t("Save Defaults and Export"))}</button><button type="button" id="cancel">${escape(t("Cancel"))}</button></div></form><script nonce="${nonce}">const api=acquireVsCodeApi(),defaults=${data};document.getElementById('cancel').addEventListener('click',()=>api.postMessage({type:'cancel'}));document.getElementById('form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target),o={...defaults,margins:{...defaults.margins}};for(const key of ['paper','pageRanges'])if(f.has(key))o[key]=f.get(key);for(const key of ['width','height','fontSize','scale','imageWidth','imageScale','jpegQuality'])if(f.has(key))o[key]=Number(f.get(key));if('${format}'==='pdf'){o.landscape=f.has('landscape');for(const key of ['top','right','bottom','left'])o.margins[key]=Number(f.get(key));o.header=f.getAll('header');o.footer=f.getAll('footer');}api.postMessage({type:'export',options:o,save:e.submitter?.name==='save'});});window.addEventListener('message',e=>{if(e.data.type==='error')document.getElementById('error').textContent=e.data.message;});</script></body></html>`;
  });
}
module.exports = { captureTheme, invalidateTheme, exportSettings };
