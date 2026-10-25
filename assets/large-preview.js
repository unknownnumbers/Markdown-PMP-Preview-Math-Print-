/* Continuous reading with a bounded DOM. Source maps belong to chunks rather
   than VS Code's full-document geometry cache. */
(() => {
  "use strict";
  const vscode = acquireVsCodeApi();
  const { contextAt, findContextOffset, wordAt } = globalThis.PmpPreviewLocate;
  const content = document.getElementById("pmp-content");
  const findBox = document.getElementById("pmp-find");
  const findInput = document.getElementById("pmp-query");
  const count = document.getElementById("pmp-count");
  const messageBox = document.getElementById("pmp-message");
  let model,
    revision,
    sections = [],
    heights = [],
    prefix = [0];
  let mounted = new Set(),
    requested = new Set(),
    wanted = new Set();
  let geometry = [],
    geometryDirty = true,
    frame,
    findTimer,
    fontsLoading,
    fontsSettled = false,
    pendingLocate;
  let reportedContent = false;
  function reportPaint(phase) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        post("paint", {
          phase,
          fontsReady:
            !model?.themed ||
            document.documentElement.classList.contains("pmp-fonts-ready"),
        }),
      ),
    );
  }
  let seek,
    ignoredY,
    searchResult,
    searchIndex = 0,
    lastReported = -1;
  let contentTop = 0,
    viewportWidth = 0,
    resizeTimer;
  const tableWidths = new Map();
  const post = (type, data = {}) =>
    vscode.postMessage({ type, revision, ...data });
  const observer = new ResizeObserver((entries) => {
    if (
      entries.some((entry) => mounted.has(Number(entry.target.dataset.chunk)))
    ) {
      preserve(() => measure());
      schedule();
    }
  });
  function rebuildPrefix() {
    prefix = [0];
    for (const height of heights) prefix.push(prefix.at(-1) + height);
  }
  function chunkAtY(y) {
    let lo = 0,
      hi = heights.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (prefix[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, heights.length - 1);
  }
  function estimate(chunk) {
    const style = getComputedStyle(content),
      font = parseFloat(style.fontSize),
      lineHeight = parseFloat(style.lineHeight) || font * 1.6;
    const ems = Math.max(8, content.clientWidth / font - 3);
    if (!chunk.runs.length)
      return Math.max(lineHeight, (chunk.units / ems) * lineHeight);
    return Math.max(
      lineHeight,
      chunk.runs.reduce(
        (sum, [units, kind]) =>
          sum +
          Math.max(1, Math.ceil(units / ems)) * lineHeight +
          (kind === "li" ? 0 : kind === "tr" ? 18 : 16),
        0,
      ),
    );
  }
  function refreshGeometry() {
    if (!geometryDirty) return;
    geometry = [];
    for (const index of [...mounted].sort((a, b) => a - b)) {
      for (const element of sections[index].querySelectorAll(
        "[data-pmp-line]",
      )) {
        const rect = element.getBoundingClientRect();
        if (!rect.height || getComputedStyle(element).display === "none")
          continue;
        geometry.push({
          element,
          key: element.dataset.pmpKey,
          line: Number(element.dataset.pmpLine),
          end: Number(element.dataset.pmpEnd),
          top: rect.top + scrollY,
          height: rect.height,
        });
      }
    }
    geometry.sort((a, b) => a.top - b.top || a.line - b.line);
    geometryDirty = false;
  }
  function currentAnchor() {
    refreshGeometry();
    let lo = 0,
      hi = geometry.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (geometry[mid].top <= scrollY + 2) lo = mid + 1;
      else hi = mid;
    }
    const index = Math.max(0, lo - 1),
      anchor = geometry[index];
    if (
      anchor &&
      anchor.top + anchor.height < scrollY &&
      Number(anchor.element.closest(".pmp-chunk").dataset.chunk) !==
        chunkAtY(scrollY - contentTop)
    )
      return undefined;
    return anchor
      ? { ...anchor, index, screen: anchor.top - scrollY }
      : undefined;
  }
  function currentLine() {
    const anchor = currentAnchor();
    if (!anchor)
      return model?.chunks[chunkAtY(scrollY - contentTop)]?.line || 0;
    const next = geometry[anchor.index + 1];
    const end = Math.max(
      anchor.line + 1,
      Math.min(anchor.end, next?.line > anchor.line ? next.line : anchor.end),
    );
    const height = Math.min(
      anchor.height,
      next?.top > anchor.top ? next.top - anchor.top : anchor.height,
    );
    return Math.min(
      model.lineCount - 1,
      anchor.line +
        Math.min(
          0.999,
          Math.max(0, (scrollY - anchor.top) / Math.max(1, height)),
        ) *
          (end - anchor.line),
    );
  }
  function moveTo(y) {
    scrollTo(0, Math.max(0, y));
    ignoredY = scrollY;
  }
  function preserve(change) {
    const anchor = currentAnchor();
    const chunk = heights.length ? chunkAtY(scrollY - contentTop) : 0;
    const oldTop = prefix[chunk] || 0;
    change();
    geometryDirty = true;
    if (seek) return;
    if (anchor?.element.isConnected) {
      const top = anchor.element.getBoundingClientRect().top;
      if (Math.abs(top - anchor.screen) > 0.5)
        moveTo(scrollY + top - anchor.screen);
    } else if (Math.abs((prefix[chunk] || 0) - oldTop) > 0.5)
      moveTo(scrollY + prefix[chunk] - oldTop);
  }
  function measure() {
    let changed = false;
    for (const index of mounted) {
      const height = sections[index].getBoundingClientRect().height;
      if (Math.abs(heights[index] - height) > 0.5) {
        heights[index] = Math.max(1, height);
        changed = true;
      }
    }
    if (changed) rebuildPrefix();
    geometryDirty = true;
  }
  function selectionChunks() {
    const selection = getSelection();
    if (!selection || selection.isCollapsed) return [];
    const chunk = (node) =>
      (node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement
      )?.closest(".pmp-chunk")?.dataset.chunk;
    const a = chunk(selection.anchorNode),
      b = chunk(selection.focusNode);
    return a === undefined || b === undefined
      ? []
      : [Math.min(Number(a), Number(b)), Math.max(Number(a), Number(b))];
  }
  function updateWindow() {
    if (!model) return;
    const overscan = Math.max(900, innerHeight * 1.5);
    const first = chunkAtY(scrollY - contentTop - overscan);
    const last = chunkAtY(scrollY - contentTop + innerHeight + overscan);
    wanted = new Set();
    for (let i = Math.max(0, first); i <= last; i++) wanted.add(i);
    if (seek)
      for (
        let i = Math.max(0, seek.chunk - 1);
        i <= Math.min(sections.length - 1, seek.chunk + 1);
        i++
      )
        wanted.add(i);
    const selected = selectionChunks();
    const missing = [];
    for (const index of mounted) {
      if (
        wanted.has(index) ||
        (selected.length && index >= selected[0] && index <= selected[1])
      )
        continue;
      const section = sections[index];
      observer.unobserve(section);
      section.style.height = `${heights[index]}px`;
      section.replaceChildren();
      mounted.delete(index);
      geometryDirty = true;
    }
    for (const index of wanted)
      if (!mounted.has(index) && !requested.has(index)) {
        requested.add(index);
        missing.push(index);
      }
    if (missing.length) post("chunks", { indices: missing });
  }
  function tableLayout(section) {
    for (const table of section.querySelectorAll("table[data-pmp-table]")) {
      const id = table.dataset.pmpTable;
      if (!tableWidths.has(id)) {
        const sample = document.createElement("div");
        sample.className = "markdown-body pmp-table-sample";
        sample.style.width = `${content.clientWidth}px`;
        sample.innerHTML = model.tables[Number(id)];
        document.body.append(sample);
        const row = sample.querySelector("tr");
        const cells = [...(row?.children || [])];
        const widths = cells.map((cell) => cell.getBoundingClientRect().width);
        const total = widths.reduce((a, b) => a + b, 0);
        tableWidths.set(
          id,
          widths.map((width) =>
            total ? (width / total) * 100 : 100 / widths.length,
          ),
        );
        sample.remove();
      }
      const widths = tableWidths.get(id);
      if (widths.length) {
        table.querySelector(":scope > colgroup")?.remove();
        const columns = document.createElement("colgroup");
        for (const width of widths) {
          const col = document.createElement("col");
          col.style.width = `${width}%`;
          columns.append(col);
        }
        table.prepend(columns);
      }
    }
  }
  function revealLine(
    line,
    chunk,
    id,
    syncSource = false,
    locate = false,
    location,
  ) {
    if (!model) return;
    if (locate) pendingLocate = undefined;
    seek = { line, chunk, id, syncSource, locate, location };
    moveTo(contentTop + prefix[chunk]);
    updateWindow();
    finishSeek();
  }
  function finishSeek() {
    if (!seek || !mounted.has(seek.chunk)) return;
    const target = seek;
    refreshGeometry();
    const anchors = geometry.filter(
      (x) =>
        Number(x.element.closest(".pmp-chunk").dataset.chunk) === target.chunk,
    );
    let anchor = anchors[0];
    for (const item of anchors) if (item.line <= target.line) anchor = item;
    const element =
      target.id &&
      sections[target.chunk].querySelector(`#${CSS.escape(target.id)}`);
    const offset = target.locate ? innerHeight * 0.4 : 0;
    const textRect =
      target.locate && anchor
        ? forwardTextRect(anchor.element, target.line, target.location)
        : undefined;
    if (textRect) moveTo(scrollY + textRect.top - offset);
    else if (element)
      moveTo(scrollY + element.getBoundingClientRect().top - offset);
    else if (anchor) {
      const next = anchors[anchors.indexOf(anchor) + 1];
      const end = Math.max(
        anchor.line + 1,
        Math.min(anchor.end, next?.line > anchor.line ? next.line : anchor.end),
      );
      const height = Math.min(
        anchor.height,
        next?.top > anchor.top ? next.top - anchor.top : anchor.height,
      );
      moveTo(
        anchor.top +
          Math.min(
            1,
            Math.max(0, (target.line - anchor.line) / (end - anchor.line)),
          ) *
            height -
          offset,
      );
    }
    seek = undefined;
    highlightResult();
    lastReported = currentLine();
    vscode.setState({ line: lastReported });
    updateWindow();
    if (target.locate && anchor) {
      if (model.themed && !fontsSettled) pendingLocate = target;
      else showLocate(anchor.element, target.line, target.location);
    }
    post("position", { line: lastReported, programmatic: !target.syncSource });
  }
  function isTextBlock(element) {
    return ["paragraph_open", "heading_open", "list_item_open"].includes(
      element.dataset.pmpKind,
    );
  }
  function forwardTextRect(element, line, location) {
    if (!location || location.block || !isTextBlock(element)) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement.closest(
          ".inkpage-math, .inkpage-math-fallback, .inkpage-math-error, .inkpage-math-error-message",
        )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const text = nodes.map((node) => node.data).join("");
    const fraction =
      (line -
        Number(element.dataset.pmpLine) +
        location.character / Math.max(1, location.lineLength)) /
      Math.max(
        1,
        Number(element.dataset.pmpEnd) - Number(element.dataset.pmpLine),
      );
    const at = findContextOffset(
      text,
      location.before,
      location.after,
      Math.round(text.length * fraction),
    );
    if (at === undefined) return;
    const [start, end] = wordAt(text, at);
    const position = (offset) => {
      for (const node of nodes) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      return [nodes.at(-1), nodes.at(-1).length];
    };
    const range = new Range();
    range.setStart(...position(start));
    range.setEnd(...position(end));
    return [...range.getClientRects()].find(
      (rect) => rect.width > 0 && rect.height > 0,
    );
  }
  function showLocate(element, line, location) {
    document.querySelector(".pmp-forward-highlight")?.remove();
    const textRect = forwardTextRect(element, line, location);
    const rect = textRect || element.getBoundingClientRect();
    const circle = model.forwardSearchIndicator === "circle";
    const overlay = document.createElement("div");
    overlay.className =
      "pmp-forward-highlight" + (circle ? " pmp-forward-circle" : "");
    overlay.dataset.pmpLocateLine = String(line);
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      left: `${rect.left + scrollX}px`,
      top: `${rect.top + scrollY}px`,
    });
    if (circle) {
      if (textRect) {
        overlay.style.left = `${rect.left + scrollX + rect.width / 2}px`;
        overlay.style.top = `${rect.top + scrollY + rect.height / 2}px`;
      } else {
        const start = Number(element.dataset.pmpLine);
        const lines = Math.max(1, Number(element.dataset.pmpEnd) - start);
        const fraction = Math.min(1, Math.max(0, (line - start) / lines));
        const halfLine = Math.min(
          rect.height / 2,
          (parseFloat(getComputedStyle(element).lineHeight) || 24) / 2,
        );
        overlay.style.top = `${rect.top + scrollY + Math.min(rect.height - halfLine, Math.max(halfLine, fraction * rect.height))}px`;
      }
    } else {
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }
    document.body.append(overlay);
    setTimeout(() => overlay.remove(), circle ? 500 : 1000);
  }
  function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement.closest(".inkpage-katex-mathml")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function highlightResult() {
    CSS.highlights?.delete("pmp-find");
    const result = searchResult;
    if (!result?.total || !mounted.has(result.chunk)) return;
    const nodes = textNodes(sections[result.chunk]);
    const range = new Range();
    let offset = 0,
      began = false;
    for (const node of nodes) {
      if (!began && offset + node.length > result.start) {
        range.setStart(node, Math.max(0, result.start - offset));
        began = true;
      }
      if (began && offset + node.length >= result.start + result.length) {
        range.setEnd(node, result.start + result.length - offset);
        CSS.highlights?.set("pmp-find", new Highlight(range));
        if (result.reveal) {
          moveTo(scrollY + range.getBoundingClientRect().top - innerHeight / 3);
          result.reveal = false;
        }
        return;
      }
      offset += node.length;
    }
  }
  function showFind() {
    findBox.hidden = false;
    findInput.focus();
    findInput.select();
  }
  function find(delta = 0) {
    searchIndex = delta ? searchIndex + delta : 0;
    post("find", { query: findInput.value, index: searchIndex });
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!model) return;
      updateWindow();
      if (seek) return;
      const line = currentLine();
      vscode.setState({ line });
      if (ignoredY !== undefined && Math.abs(scrollY - ignoredY) < 1) return;
      ignoredY = undefined;
      if (Math.abs(line - lastReported) < 0.05) return;
      lastReported = line;
      post("position", { line });
    });
  }
  async function loadFonts() {
    if (
      !model.themed ||
      document.documentElement.classList.contains("pmp-fonts-ready")
    )
      return;
    if (!fontsLoading)
      fontsLoading = Promise.all(
        [...document.fonts]
          .filter((face) => /^['"]?Inkpage /.test(face.family))
          .map((face) => face.load()),
      );
    try {
      await fontsLoading;
      const line = currentLine(),
        chunk = chunkAtY(scrollY - contentTop);
      document.documentElement.classList.add("pmp-fonts-ready");
      tableWidths.clear();
      for (const i of mounted) tableLayout(sections[i]);
      geometryDirty = true;
      measure();
      revealLine(line, chunk);
      reportPaint("fonts");
    } catch (error) {
      console.error("[Markdown PMP] Could not load preview fonts.", error);
    } finally {
      fontsSettled = true;
      if (pendingLocate) {
        const target = pendingLocate;
        pendingLocate = undefined;
        revealLine(
          target.line,
          target.chunk,
          target.id,
          false,
          true,
          target.location,
        );
      }
    }
  }
  function initialize(data) {
    model = data.model;
    document.body.dataset.pmpSuppressAltMenus = String(model.suppressAltMenus);
    revision = data.revision;
    pendingLocate = undefined;
    document.querySelector(".pmp-forward-highlight")?.remove();
    reportedContent = false;
    requested.clear();
    mounted.clear();
    tableWidths.clear();
    observer.disconnect();
    geometry = [];
    geometryDirty = true;
    searchResult = undefined;
    const themed = document.documentElement.classList.toggle(
      "pmp-themed",
      model.themed,
    );
    document
      .getElementById("pmp-theme-marker")
      .classList.toggle("inkpage-theme-marker", themed);
    document.getElementById("pmp-variables").textContent = model.css;
    content.replaceChildren();
    contentTop = content.getBoundingClientRect().top + scrollY;
    viewportWidth = content.clientWidth;
    heights = model.chunks.map(estimate);
    rebuildPrefix();
    const fragment = document.createDocumentFragment();
    sections = model.chunks.map((_, index) => {
      const section = document.createElement("section");
      section.className = "pmp-chunk";
      section.dataset.chunk = String(index);
      section.style.height = `${heights[index]}px`;
      fragment.append(section);
      return section;
    });
    content.append(fragment);
    messageBox.hidden = true;
    revealLine(
      data.line || 0,
      data.chunk || 0,
      data.id,
      false,
      data.locate,
      data.location,
    );
    void loadFonts();
    if (!findBox.hidden && findInput.value) find();
  }
  window.addEventListener("message", ({ data }) => {
    if (data.type === "focus") {
      window.focus();
      content.focus({ preventScroll: true });
      return;
    }
    if (data.type === "document") {
      initialize(data);
      return;
    }
    if (data.type === "showFind") {
      showFind();
      return;
    }
    if (data.type === "error") {
      messageBox.textContent = data.message;
      messageBox.hidden = false;
      return;
    }
    if (data.revision !== revision) return;
    if (data.type === "reveal")
      revealLine(
        data.line,
        data.chunk,
        data.id,
        data.syncSource,
        data.locate,
        data.location,
      );
    if (
      data.type === "findResult" &&
      data.query === findInput.value &&
      !findBox.hidden
    ) {
      searchResult = { ...data.result, reveal: true };
      searchIndex = data.result.index;
      count.textContent = data.result.total
        ? `${searchIndex + 1} / ${data.result.total}`
        : "0 / 0";
      if (data.result.total)
        revealLine(data.result.line, data.result.chunk, undefined, true);
      else CSS.highlights?.delete("pmp-find");
    }
    if (data.type === "chunks") {
      const completingSeek = Boolean(seek);
      preserve(() => {
        for (const item of data.chunks) {
          requested.delete(item.index);
          if (!wanted.has(item.index) || mounted.has(item.index)) continue;
          const section = sections[item.index];
          section.innerHTML = item.html;
          section.style.height = "";
          tableLayout(section);
          mounted.add(item.index);
          observer.observe(section);
        }
        measure();
      });
      finishSeek();
      highlightResult();
      if (!completingSeek) ignoredY = undefined;
      if (!reportedContent && mounted.size) {
        reportedContent = true;
        reportPaint("content");
      }
      schedule();
    }
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener(
    "wheel",
    () => {
      seek = undefined;
      pendingLocate = undefined;
      ignoredY = undefined;
    },
    { passive: true },
  );
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!model || viewportWidth === content.clientWidth) return;
      const line = currentLine(),
        chunk = chunkAtY(scrollY - contentTop);
      viewportWidth = content.clientWidth;
      tableWidths.clear();
      heights = model.chunks.map((data, i) =>
        mounted.has(i) ? heights[i] : estimate(data),
      );
      sections.forEach((section, i) => {
        if (!mounted.has(i)) section.style.height = `${heights[i]}px`;
      });
      for (const i of mounted) tableLayout(sections[i]);
      rebuildPrefix();
      measure();
      revealLine(line, chunk);
    }, 100);
  });
  document.getElementById("pmp-show-find").addEventListener("click", showFind);
  document
    .getElementById("pmp-headings")
    .addEventListener("click", () => post("headings"));
  document
    .getElementById("pmp-find-next")
    .addEventListener("click", () => find(1));
  document
    .getElementById("pmp-find-previous")
    .addEventListener("click", () => find(-1));
  document.getElementById("pmp-find-close").addEventListener("click", () => {
    findBox.hidden = true;
    clearTimeout(findTimer);
    searchResult = undefined;
    CSS.highlights?.delete("pmp-find");
    content.focus({ preventScroll: true });
  });
  findInput.addEventListener("input", () => {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => find(), 140);
  });
  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      find(event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape")
      document.getElementById("pmp-find-close").click();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        showFind();
      }
    },
    true,
  );
  content.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    post("link", { href: link.getAttribute("href") });
  });
  content.addEventListener("dblclick", (event) => {
    const block = event.target.closest("[data-pmp-line]");
    if (
      block &&
      model.doubleClickToSwitchToEditor &&
      !event.target.closest("a")
    ) {
      const rect = block.getBoundingClientRect();
      const first = Number(block.dataset.pmpLine);
      const count = Math.max(1, Number(block.dataset.pmpEnd) - first);
      const line =
        first +
        Math.min(0.999, Math.max(0, (event.clientY - rect.top) / rect.height)) *
          count;
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      const node = caret?.startContainer;
      const coarse =
        !isTextBlock(block) ||
        Boolean(
          event.target.closest(
            ".inkpage-math, .inkpage-math-fallback, .inkpage-math-error",
          ),
        );
      const context =
        !coarse && node?.nodeType === Node.TEXT_NODE && block.contains(node)
          ? contextAt(node.data, caret.startOffset)
          : {};
      event.preventDefault();
      post("source", {
        line,
        block: block.dataset.pmpKey,
        horizontal: Math.min(
          1,
          Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)),
        ),
        coarse,
        ...context,
      });
    }
  });
  content.addEventListener(
    "load",
    () => {
      geometryDirty = true;
    },
    true,
  );
  document.addEventListener("selectionchange", schedule);
  post("ready", { line: vscode.getState()?.line });
})();
