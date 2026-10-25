(() => {
  // Native Markdown previews can rerun contributed scripts after edits.
  if (document.pmpPreviewKeyboardStarted) return;
  document.pmpPreviewKeyboardStarted = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        !["e", "s"].includes(event.key.toLowerCase())
      )
        return;
      const enabled =
        document.body.dataset.pmpSuppressAltMenus ??
        document.querySelector(".pmp-preview-keyboard")?.dataset
          .pmpSuppressAltMenus;
      if (enabled === "true") {
        // Shortcut resolution retains code/keyCode; only the competing menu
        // character is hidden from VS Code's mnemonic listener.
        Object.defineProperty(event, "key", { value: "Unidentified" });
      }
    },
    true,
  );
})();
