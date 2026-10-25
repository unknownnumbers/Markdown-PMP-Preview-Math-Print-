/* Shared, block-local text matching for source and preview positions. */
((factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else globalThis.PmpPreviewLocate = api;
})(() => {
  "use strict";
  const CONTEXT = 96;
  function contextAt(text, offset) {
    return {
      before: text.slice(Math.max(0, offset - CONTEXT), offset),
      after: text.slice(offset, offset + CONTEXT),
    };
  }
  function normalized(text) {
    const value = [];
    const offsets = [];
    for (let i = 0; i < text.length; i++) {
      const character = /\s/.test(text[i]) ? " " : text[i];
      if (character === " " && value.at(-1) === " ") continue;
      offsets.push(i);
      value.push(character);
    }
    offsets.push(text.length);
    return { value: value.join(""), offsets };
  }
  function findContextOffset(text, before, after, expected = 0) {
    const target = normalized(text);
    before = normalized(before.slice(-CONTEXT)).value;
    after = normalized(after.slice(0, CONTEXT)).value;
    if (!before && !after) return undefined;
    const expectedIndex = Math.max(
      0,
      target.offsets.findIndex((offset) => offset >= expected),
    );
    const candidates = new Set();
    for (const [context, preceding] of [
      [before, true],
      [after, false],
    ]) {
      if (!context) continue;
      for (const size of new Set([
        Math.min(32, context.length),
        16,
        8,
        4,
        2,
        1,
      ])) {
        if (size > context.length) continue;
        const seed = preceding ? context.slice(-size) : context.slice(0, size);
        for (const hit of [
          target.value.lastIndexOf(seed, expectedIndex),
          target.value.indexOf(seed, expectedIndex),
        ])
          if (hit >= 0) candidates.add(hit + (preceding ? seed.length : 0));
      }
    }
    let best;
    for (const at of candidates) {
      let left = 0,
        right = 0;
      while (
        left < before.length &&
        at > left &&
        before.at(-left - 1) === target.value[at - left - 1]
      )
        left++;
      while (
        right < after.length &&
        at + right < target.value.length &&
        after[right] === target.value[at + right]
      )
        right++;
      const matched = left + right;
      const score = matched + Math.min(left, right);
      const offset = target.offsets[at];
      const distance = Math.abs(offset - expected);
      if (
        matched >= Math.min(4, before.length + after.length) &&
        (!best ||
          score > best.score ||
          (score === best.score && distance < best.distance))
      )
        best = { offset, score, distance };
    }
    return best?.offset;
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  function wordAt(text, offset) {
    const at = Math.max(0, Math.min(text.length - 1, offset));
    for (const segment of segmenter.segment(text))
      if (segment.index + segment.segment.length > at)
        return segment.isWordLike
          ? [segment.index, segment.index + segment.segment.length]
          : [at, Math.min(text.length, at + 1)];
    return [at, Math.min(text.length, at + 1)];
  }
  return { contextAt, findContextOffset, wordAt };
});
