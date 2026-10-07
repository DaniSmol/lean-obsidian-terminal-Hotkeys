import { describe, it, expect } from "vitest";
import { handleEscapeKey, isPlainEscape, type EscapeKeyLike } from "./escape-focus";

const esc = (over: Partial<EscapeKeyLike> = {}): EscapeKeyLike => ({
  key: "Escape",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
  ...over,
});

// Runs deferred callbacks in order, like a microtask + animation-frame pair.
function harness(opts: { enabled: boolean; focusAfter: boolean[] }) {
  const queue: Array<() => void> = [];
  let restores = 0;
  let checks = 0;
  handleEscapeKey({
    event: esc(),
    enabled: opts.enabled,
    hasFocus: () => opts.focusAfter[checks++] ?? true,
    restore: () => {
      restores++;
    },
    deferSoon: (fn) => queue.push(fn),
    deferLater: (fn) => queue.push(fn),
  });
  const run = () => queue.splice(0).forEach((fn) => fn());
  return { queue, run, restores: () => restores };
}

describe("isPlainEscape", () => {
  it("accepts a bare Escape keydown", () => {
    expect(isPlainEscape(esc())).toBe(true);
  });

  it("rejects other keys, modified Escape and IME composition", () => {
    expect(isPlainEscape(esc({ key: "a" }))).toBe(false);
    expect(isPlainEscape(esc({ ctrlKey: true }))).toBe(false);
    expect(isPlainEscape(esc({ altKey: true }))).toBe(false);
    expect(isPlainEscape(esc({ shiftKey: true }))).toBe(false);
    expect(isPlainEscape(esc({ metaKey: true }))).toBe(false);
    expect(isPlainEscape(esc({ isComposing: true }))).toBe(false);
  });
});

describe("handleEscapeKey", () => {
  // Regression for #97: Obsidian's capture-phase Escape handler moves focus out of
  // the terminal, so vim/helix/Claude Code lose focus whenever they get Escape.
  it("restores terminal focus when Obsidian moved it away", () => {
    const h = harness({ enabled: true, focusAfter: [false] });
    h.run();
    expect(h.restores()).toBe(1);
  });

  it("does nothing when the terminal kept focus", () => {
    const h = harness({ enabled: true, focusAfter: [true, true] });
    h.run();
    expect(h.restores()).toBe(0);
  });

  it("restores at most once per keypress even if both checks see lost focus", () => {
    const h = harness({ enabled: true, focusAfter: [false, false] });
    h.run();
    expect(h.restores()).toBe(1);
  });

  it("catches focus that is lost later in the same turn (second check)", () => {
    const h = harness({ enabled: true, focusAfter: [true, false] });
    h.run();
    expect(h.restores()).toBe(1);
  });

  it("does nothing when the option is disabled", () => {
    const h = harness({ enabled: false, focusAfter: [false, false] });
    expect(h.queue.length).toBe(0);
    h.run();
    expect(h.restores()).toBe(0);
  });

  it("ignores non-Escape and modified keys", () => {
    for (const event of [esc({ key: "Tab" }), esc({ ctrlKey: true })]) {
      let scheduled = 0;
      handleEscapeKey({
        event,
        enabled: true,
        hasFocus: () => false,
        restore: () => {},
        deferSoon: () => {
          scheduled++;
        },
        deferLater: () => {
          scheduled++;
        },
      });
      expect(scheduled).toBe(0);
    }
  });
});
