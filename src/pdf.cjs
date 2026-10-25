"use strict";
const { t } = require("./i18n.cjs");

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const WebSocket = require("ws");
const { checkAbort, abortError } = require("./render.cjs");
const { normalizeExport, headerTemplate } = require("./export-options.cjs");
const {
  splitPdfHtml,
  preparePartLinks,
  pdfPageCount,
  mergePdfParts,
} = require("./pdf-parts.cjs");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserCandidates(
  customPath = "",
  platform = process.platform,
  env = process.env,
) {
  if (customPath.trim()) return [customPath.trim().replace(/^"|"$/g, "")];
  if (platform === "win32") {
    const roots = [
      env.PROGRAMFILES || "C:\\Program Files",
      env["PROGRAMFILES(X86)"] ||
        env["ProgramFiles(x86)"] ||
        "C:\\Program Files (x86)",
      env.LOCALAPPDATA,
    ].filter(Boolean);
    return [
      ...new Set(
        roots.flatMap((root) => [
          path.win32.join(
            root,
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          path.win32.join(
            root,
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
        ]),
      ),
    ];
  }
  if (platform === "darwin")
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      path.join(
        env.HOME || "",
        "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
    ];
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

async function availableBrowsers(customPath) {
  const result = [];
  for (const candidate of browserCandidates(customPath)) {
    try {
      await fs.access(candidate);
      result.push(candidate);
    } catch {
      /* Try next standard installation. */
    }
  }
  if (!result.length)
    throw new Error(
      customPath
        ? t(
            "The specified browser does not exist. Check Markdown-PMP.browserPath.",
          )
        : t(
            "Chrome or Edge was not found. Install one or set Markdown-PMP.browserPath. HTML export does not require a browser.",
          ),
    );
  return result;
}

class CdpClient {
  constructor(socket, signal) {
    this.socket = socket;
    this.signal = signal;
    this.nextId = 0;
    this.pending = new Map();
    socket.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.pending.delete(message.id);
      if (message.error)
        waiting.reject(
          new Error(`${waiting.method}: ${message.error.message}`),
        );
      else waiting.resolve(message.result || {});
    });
    socket.on("close", () =>
      this.failAll(new Error(t("The browser closed before export completed."))),
    );
    socket.on("error", (error) => this.failAll(error));
    this.onAbort = () => this.failAll(abortError());
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }
  failAll(error) {
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }
  send(method, params = {}, sessionId, timeout = 45000) {
    checkAbort(this.signal);
    return new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN)
        return reject(new Error(t("The browser connection is closed.")));
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(t("Browser operation timed out: {0}", method)));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(error);
          }
        },
      );
    });
  }
  close() {
    this.signal?.removeEventListener("abort", this.onAbort);
    this.failAll(new Error(t("The browser connection has ended.")));
    this.socket.terminate();
  }
}

async function connect(endpoint, signal) {
  checkAbort(signal);
  const socket = new WebSocket(endpoint, {
    handshakeTimeout: 10000,
    perMessageDeflate: false,
  });
  await new Promise((resolve, reject) => {
    const aborted = () => {
      socket.terminate();
      reject(abortError());
    };
    const failed = (error) => {
      signal?.removeEventListener("abort", aborted);
      reject(error);
    };
    socket.once("error", failed);
    socket.once("open", () => {
      socket.removeListener("error", failed);
      signal?.removeEventListener("abort", aborted);
      resolve();
    });
    signal?.addEventListener("abort", aborted, { once: true });
  });
  return new CdpClient(socket, signal);
}

async function printWithBrowser(browserPath, html, input) {
  checkAbort(input.signal);
  const settings = normalizeExport(input.options);
  const format = input.format || "pdf";
  let documents = format === "pdf" ? splitPdfHtml(html) : [html];
  const batched = documents.length > 1;
  if (batched) documents = documents.map(preparePartLinks);
  const pdfParts = [];
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "inkpage-pdf-"));
  const profile = path.join(temporary, "profile");
  let filename = path.join(temporary, "document-1.html");
  let child,
    client,
    closed = false,
    spawnError,
    stop;
  try {
    await fs.mkdir(profile);
    await fs.writeFile(filename, documents[0], "utf8");
    child = spawn(
      browserPath,
      [
        "--headless=new",
        // Keep Edge in the child process whose lifetime this export manages.
        ...(/msedge(?:\.exe)?$/i.test(browserPath)
          ? ["--edge-skip-compat-layer-relaunch"]
          : []),
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--metrics-recording-only",
        "--hide-scrollbars",
        "--disable-features=Translate,OptimizationHints,BackForwardCache",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
    );
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", () => {
      closed = true;
    });
    stop = () => {
      if (child && !closed) child.kill();
    };
    input.signal?.addEventListener("abort", stop, { once: true });
    let endpoint;
    const started = Date.now();
    while (Date.now() - started < 20000) {
      checkAbort(input.signal);
      if (spawnError) throw spawnError;
      if (closed)
        throw new Error(t("The browser could not start in headless mode."));
      try {
        const [port, socketPath] = (
          await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        )
          .trim()
          .split(/\r?\n/);
        if (
          /^\d+$/.test(port) &&
          socketPath?.startsWith("/devtools/browser/")
        ) {
          endpoint = `ws://127.0.0.1:${port}${socketPath}`;
          break;
        }
      } catch {
        /* The browser writes its private endpoint after startup. */
      }
      await delay(100);
    }
    if (!endpoint) throw new Error(t("Starting the browser timed out."));
    client = await connect(endpoint, input.signal);
    const { targetId } = await client.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await client.send("Page.enable", {}, sessionId);
    await client.send(
      "Emulation.setEmulatedMedia",
      { media: format === "pdf" ? "print" : "screen" },
      sessionId,
    );
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width:
          format === "pdf"
            ? // Match the printable content width before checking formulas.
              Math.floor(
                ((settings.width -
                  settings.margins.left -
                  settings.margins.right) *
                  96) /
                  25.4 /
                  settings.scale,
              )
            : settings.imageWidth,
        height: 1000,
        deviceScaleFactor: format === "pdf" ? 1 : settings.imageScale,
        mobile: false,
      },
      sessionId,
    );
    for (
      let documentIndex = 0;
      documentIndex < documents.length;
      documentIndex++
    ) {
      checkAbort(input.signal);
      if (batched)
        input.onProgress?.(
          t(
            "Generating PDF: section {0}/{1}...",
            documentIndex + 1,
            documents.length,
          ),
        );
      if (documentIndex) {
        filename = path.join(temporary, `document-${documentIndex + 1}.html`);
        await fs.writeFile(filename, documents[documentIndex], "utf8");
      }
      const documentUrl = pathToFileURL(filename).href;
      const navigation = await client.send(
        "Page.navigate",
        { url: documentUrl },
        sessionId,
      );
      if (navigation.errorText)
        throw new Error(
          t("Could not load the layout page: {0}", navigation.errorText),
        );
      let ready = false;
      const loadStarted = Date.now();
      while (Date.now() - loadStarted < 120000) {
        const state = await client.send(
          "Runtime.evaluate",
          {
            expression: `location.href === ${JSON.stringify(documentUrl)} && document.readyState === 'complete'`,
            returnByValue: true,
          },
          sessionId,
        );
        if (state.result?.value) {
          ready = true;
          break;
        }
        checkAbort(input.signal);
        await delay(100);
      }
      if (!ready) throw new Error(t("Loading the page or images timed out."));
      const prepared = await client.send(
        "Runtime.evaluate",
        {
          expression: `(async () => {
        await Promise.all([
          document.fonts.load('16px "Inkpage Roman"', 'Reading'),
          document.fonts.load('16px "Inkpage WenKai"', '阅读记录'),
          document.fonts.load('16px "Inkpage Sans"', 'Heading'),
          document.fonts.load('16px "Inkpage CJK Sans"', '标题代码'),
          document.fonts.load('16px "Inkpage Mono"', 'const value = 1;')
        ]);
        await document.fonts.ready;
        const fonts = Array.from(document.fonts).filter(face => face.status === 'error').map(face => face.family);
        const images = Array.from(document.images).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.alt || img.src.slice(0, 100));
        return { fonts, images };
      })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      if (prepared.exceptionDetails)
        throw new Error(
          t(
            "Bundled fonts could not load. Export stopped to avoid font substitution.",
          ),
        );
      const failures = prepared.result?.value;
      if (failures?.fonts?.length)
        throw new Error(
          t("Could not load fonts: {0}", failures.fonts.join(", ")),
        );
      if (failures?.images?.length)
        throw new Error(
          t(
            "Could not load {0} image(s): {1}",
            failures.images.length,
            failures.images.slice(0, 3).join(", "),
          ),
        );
      const measured = await client.send(
        "Runtime.evaluate",
        {
          expression: `(${preparePage.toString()})(${JSON.stringify(
            format === "pdf"
              ? {
                  pageHeight:
                    ((settings.height -
                      settings.margins.top -
                      settings.margins.bottom) *
                      96) /
                    25.4 /
                    settings.scale,
                }
              : {},
          )})`,
          returnByValue: true,
        },
        sessionId,
      );
      if (measured.exceptionDetails)
        throw new Error(t("Could not check the math layout."));
      const page = measured.result.value;
      if (page.errors.length)
        throw new Error(
          t(
            "Math is too wide even at 80%: {0}. Split the formula or adjust paper orientation or image width.",
            [...new Set(page.errors)].map((x) => t("line {0}", x)).join(", "),
          ),
        );
      if (format !== "pdf") {
        input.onProgress?.(t("Generating images..."));
        const maxHeight = Math.max(
          256,
          Math.floor(
            Math.min(
              16000 / settings.imageScale,
              32000000 / (settings.imageWidth * settings.imageScale ** 2),
            ),
          ),
        );
        const segments = [];
        for (let start = 0; start < page.height;) {
          let end = Math.min(page.height, start + maxHeight);
          if (end < page.height) {
            const choices = page.boundaries.filter(
              (y) =>
                y > start + maxHeight * 0.4 &&
                y <= end &&
                !page.protected.some(([top, bottom]) => top < y && bottom > y),
            );
            if (choices.length) end = Math.floor(Math.max(...choices));
          }
          if (end <= start)
            throw new Error(t("Could not split the long image."));
          const captured = await client.send(
            "Page.captureScreenshot",
            {
              format,
              ...(format === "jpeg" ? { quality: settings.jpegQuality } : {}),
              captureBeyondViewport: true,
              fromSurface: true,
              clip: {
                x: 0,
                y: start,
                width: settings.imageWidth,
                height: end - start,
                scale: 1,
              },
            },
            sessionId,
            60000,
          );
          checkAbort(input.signal);
          segments.push(Buffer.from(captured.data, "base64"));
          start = end;
        }
        return segments;
      }
      if (!batched)
        input.onProgress?.(t("Fonts and images are ready. Generating PDF..."));
      const result = await client.send(
        "Page.printToPDF",
        {
          printBackground: true,
          preferCSSPageSize: true,
          paperWidth: settings.width / 25.4,
          paperHeight: settings.height / 25.4,
          marginTop: settings.margins.top / 25.4,
          marginBottom: settings.margins.bottom / 25.4,
          marginLeft: settings.margins.left / 25.4,
          marginRight: settings.margins.right / 25.4,
          scale: settings.scale,
          pageRanges: batched ? "" : settings.pageRanges,
          displayHeaderFooter: Boolean(
            !batched && (settings.header.length || settings.footer.length),
          ),
          headerTemplate: headerTemplate(
            settings.header,
            input.title || "Markdown",
            input.foreground,
          ),
          footerTemplate: headerTemplate(
            settings.footer,
            input.title || "Markdown",
            input.foreground,
          ),
          generateDocumentOutline: true,
          generateTaggedPDF: true,
          transferMode: "ReturnAsBase64",
        },
        sessionId,
        300000,
      );
      checkAbort(input.signal);
      if (!result.data)
        throw new Error(t("The browser did not return PDF data."));
      const bytes = Buffer.from(result.data, "base64");
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new Error(t("The browser did not return a valid PDF file."));
      if (!batched) return bytes;
      const partFilename = path.join(
        temporary,
        `part-${documentIndex + 1}.pdf`,
      );
      await fs.writeFile(partFilename, bytes);
      pdfParts.push({
        filename: partFilename,
        pages: await pdfPageCount(bytes),
      });
    }
    input.onProgress?.(t("Combining {0} PDF sections...", pdfParts.length));
    return await mergePdfParts(pdfParts, settings, input);
  } finally {
    if (stop) input.signal?.removeEventListener("abort", stop);
    if (client) {
      try {
        await client.send("Browser.close", {}, undefined, 1200);
      } catch {
        /* It may close the socket before replying. */
      }
      client.close();
    }
    if (child && !closed) {
      for (let n = 0; n < 15 && !closed; n++) await delay(100);
      if (!closed) child.kill();
    }
    try {
      const relative = path.relative(
        path.resolve(os.tmpdir()),
        path.resolve(temporary),
      );
      if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !path.basename(temporary).startsWith("inkpage-pdf-")
      )
        throw new Error(
          t("The temporary directory is outside the export cleanup scope."),
        );
      await fs.rm(temporary, {
        recursive: true,
        force: true,
        maxRetries: 12,
        retryDelay: 150,
      });
    } catch {
      /* The OS can release browser cache handles asynchronously. */
    }
  }
}

async function createPdf(html, input = {}) {
  const candidates = await availableBrowsers(input.browserPath);
  const failures = [];
  for (const candidate of candidates) {
    checkAbort(input.signal);
    input.onProgress?.(
      t(
        "Starting {0} for background layout...",
        /msedge|microsoft.?edge/i.test(candidate) ? "Edge" : "Chrome",
      ),
    );
    try {
      return await printWithBrowser(candidate, html, input);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      failures.push(`${path.basename(candidate)}: ${error.message}`);
    }
  }
  throw new Error(
    t(
      "{0} export failed. {1}",
      (input.format || "pdf").toUpperCase(),
      failures.join("; "),
    ),
  );
}

function preparePage({ pageHeight } = {}) {
  const errors = [];
  let fallbacks = 0;
  function containerWidth(container) {
    while (
      container.parentElement &&
      getComputedStyle(container).display === "inline"
    )
      container = container.parentElement;
    const style = getComputedStyle(container);
    return (
      container.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  }
  if (pageHeight) {
    const canvas = document.createElement("canvas").getContext("2d");
    const tables = Array.from(
      document.querySelectorAll(".markdown-body table"),
      (table) => {
        const cells = Array.from(table.rows[0]?.cells || []);
        const widths = cells.map((cell) => cell.getBoundingClientRect().width);
        const minimums = cells.map((cell) => {
          const style = getComputedStyle(cell);
          canvas.font = style.font;
          return Math.max(
            parseFloat(style.fontSize) * 4,
            canvas.measureText(cell.textContent).width +
              parseFloat(style.paddingLeft) +
              parseFloat(style.paddingRight),
          );
        });
        return {
          table,
          cells,
          widths,
          minimums,
          total: widths.reduce((a, b) => a + b, 0),
          available: containerWidth(table.parentElement),
        };
      },
    );
    for (const { table, cells, widths, minimums, total, available } of tables) {
      table.style.display = "table";
      if (
        !cells.length ||
        table.querySelector("colgroup") ||
        cells.some((cell) => cell.colSpan !== 1)
      )
        continue;
      const target = Math.min(total, available);
      const floors = minimums.map((width) =>
        Math.min(width, target / cells.length),
      );
      const remaining = Math.max(0, target - floors.reduce((a, b) => a + b, 0));
      table.style.width = `${Math.floor(target)}px`;
      table.style.tableLayout = "fixed";
      cells.forEach((cell, i) => {
        cell.style.width = `${((floors[i] + (remaining * widths[i]) / total) / target) * 100}%`;
      });
    }
  }
  function tooWide(formula) {
    const source = formula.dataset.inkpageSource;
    if (source === undefined) {
      errors.push(formula.dataset.inkpageLine);
      return;
    }
    const code = document.createElement("code");
    code.className = "inkpage-math-fallback";
    code.dataset.inkpageLine = formula.dataset.inkpageLine;
    code.textContent = source;
    if (formula.classList.contains("inkpage-math-display")) {
      const pre = document.createElement("pre");
      pre.className = "inkpage-math-fallback";
      pre.append(code);
      formula.replaceWith(pre);
    } else formula.replaceWith(code);
    fallbacks++;
  }
  const measurements = [];
  // Collect reads before changing fonts or replacing formulas. A write between
  // reads would lay out the entire document again for every affected formula.
  for (const formula of document.querySelectorAll(".inkpage-math")) {
    const content = formula.querySelector(".inkpage-equation-content");
    if (!content) continue;
    const container = formula.classList.contains("inkpage-math-display")
      ? formula
      : formula.parentElement;
    const available = containerWidth(container);
    const width = content.getBoundingClientRect().width;
    if (width > available + 1)
      measurements.push({ formula, content, available, width });
  }
  const scaled = [];
  for (const { formula, content, available, width } of measurements) {
    const ratio = available / width;
    if (ratio < 0.8) tooWide(formula);
    else {
      content.style.fontSize = `${Math.floor(ratio * 1000) / 10}%`;
      scaled.push({ formula, content, available });
    }
  }
  const stillWide = scaled.filter(
    ({ content, available }) =>
      content.getBoundingClientRect().width > available + 1,
  );
  for (const { formula } of stillWide) tooWide(formula);
  if (pageHeight) {
    const rows = Array.from(
      document.querySelectorAll(".markdown-body tr"),
    ).filter((row) => row.getBoundingClientRect().height > pageHeight);
    for (const row of rows) {
      row.style.breakInside = "auto";
      row.style.pageBreakInside = "auto";
    }
    return { errors, fallbacks, splitRows: rows.length };
  }
  const protectedBoxes = Array.from(
    document.querySelectorAll(".inkpage-math-display,tr,img,pre"),
  ).map((x) => {
    const r = x.getBoundingClientRect();
    return [Math.floor(r.top + scrollY), Math.ceil(r.bottom + scrollY)];
  });
  const boundaries = Array.from(
    document.querySelectorAll(".markdown-body > *,tr"),
  ).flatMap((x) => {
    const r = x.getBoundingClientRect();
    return [Math.floor(r.top + scrollY), Math.ceil(r.bottom + scrollY)];
  });
  return {
    errors,
    fallbacks,
    height: Math.ceil(
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      ),
    ),
    boundaries,
    protected: protectedBoxes,
  };
}
async function createImages(html, input = {}) {
  return createPdf(html, { ...input, format: input.format || "png" });
}
module.exports = {
  browserCandidates,
  availableBrowsers,
  createPdf,
  createImages,
  preparePage,
};
