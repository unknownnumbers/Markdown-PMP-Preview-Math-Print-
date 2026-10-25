"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPdfBesideCommand } = require("../src/editor-commands.cjs");

const uri = (path) => ({
  scheme: "file",
  path,
  toString: () => "file://" + path,
  with: (changes) => uri(changes.path || path),
});

test("Quick PDF export targets the same Unicode directory and _md filename, without saving the Markdown buffer", async () => {
  const doc = {
    uri: uri("/資料/reading notes.md"),
    languageId: "markdown",
    isUntitled: false,
  };
  const calls = [];
  const command = createPdfBesideCommand(
    {
      window: { activeTextEditor: { document: doc } },
      commands: {
        executeCommand() {
          assert.fail("Saved Markdown must not be saved again");
        },
      },
    },
    async (source, output) => {
      calls.push([source, output]);
      return output;
    },
  );
  await command();
  await command();
  assert.equal(calls.length, 2);
  for (const [source, output] of calls) {
    assert.equal(source, doc.uri);
    assert.equal(output.path, "/資料/reading notes_md.pdf");
  }
});

test("Untitled export waits for saving the source and does nothing when the save is cancelled", async () => {
  const untitled = { isUntitled: true, languageId: "markdown" };
  const editor = { document: untitled };
  let saved = false,
    exports = 0;
  const command = createPdfBesideCommand(
    {
      window: { activeTextEditor: editor },
      commands: {
        async executeCommand(name) {
          assert.equal(name, "workbench.action.files.save");
          if (saved)
            editor.document = {
              uri: uri("/draft.md"),
              languageId: "markdown",
              isUntitled: false,
            };
        },
      },
    },
    async (_source, output) => {
      exports++;
      return output;
    },
  );
  await command();
  assert.equal(exports, 0);
  saved = true;
  const result = await command();
  assert.equal(result.path, "/draft_md.pdf");
  assert.equal(exports, 1);
});

test("Repeated export requests finish the current PDF before updating it with the latest buffer", async () => {
  const doc = { uri: uri("/draft.md"), languageId: "markdown" };
  const rendered = [];
  let text = "first",
    finish;
  const command = createPdfBesideCommand(
    { window: { activeTextEditor: { document: doc } } },
    async (_source, output) => {
      rendered.push(text);
      if (rendered.length === 1)
        await new Promise((resolve) => {
          finish = resolve;
        });
      return output;
    },
  );
  const first = command();
  text = "latest";
  const second = command(),
    third = command();
  assert.deepEqual(rendered, ["first"]);
  finish();
  await Promise.all([first, second, third]);
  assert.deepEqual(rendered, ["first", "latest"]);
});
