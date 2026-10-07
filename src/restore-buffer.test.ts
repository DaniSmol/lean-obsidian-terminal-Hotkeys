import { describe, it, expect } from "vitest";
import { sanitizeRestoredBuffer } from "./restore-buffer";

const TAIL = "\x1b[0m\r\n\x1b[?25h";

describe("sanitizeRestoredBuffer", () => {
  it("appends a reset, line break and show-cursor to plain text", () => {
    expect(sanitizeRestoredBuffer("hello")).toBe("hello" + TAIL);
  });

  it("turns the alt-screen switch into a plain line break", () => {
    expect(sanitizeRestoredBuffer("history\x1b[?1049h\x1b[Hframe")).toBe(
      "history\x1b[0m\r\nframe" + TAIL
    );
  });

  it("strips alt-screen, mouse, bracketed paste and focus modes", () => {
    const saved =
      "a\x1b[?1049l\x1b[?1047h\x1b[?47l\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h" +
      "\x1b[?1015h\x1b[?2004h\x1b[?1004hb";
    expect(sanitizeRestoredBuffer(saved)).toBe("ab" + TAIL);
  });

  it("keeps unrelated private modes such as cursor visibility", () => {
    expect(sanitizeRestoredBuffer("a\x1b[?25lb")).toBe("a\x1b[?25lb" + TAIL);
  });

  it("drops trailing relative cursor moves and attribute resets", () => {
    expect(sanitizeRestoredBuffer("text\x1b[0m\x1b[3A\x1b[12C\x1b[B\x1b[0m")).toBe("text" + TAIL);
  });

  it("keeps cursor moves that are not at the end", () => {
    expect(sanitizeRestoredBuffer("a\x1b[2Ab")).toBe("a\x1b[2Ab" + TAIL);
  });
});
