(() => {
  // VS Code re-runs contributed scripts after edits in the same webview.
  if (document.pmpFontBatchStarted) return;
  document.pmpFontBatchStarted = true;
  const selector = ".inkpage-theme-marker[data-pmp-batch-fonts]";

  function loadFonts() {
    // Apply the bundled fonts together so large tables only reflow once.
    const faces = [...document.fonts].filter((face) =>
      /^['"]?Inkpage /.test(face.family),
    );
    Promise.all(faces.map((face) => face.load())).then(
      () => document.documentElement.classList.add("pmp-fonts-ready"),
      (error) =>
        console.error("[Markdown PMP] Could not load preview fonts.", error),
    );
  }

  function start() {
    if (document.querySelector(selector)) {
      loadFonts();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        loadFonts();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-pmp-batch-fonts"],
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
