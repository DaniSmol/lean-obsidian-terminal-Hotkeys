import { describe, it, expect } from "vitest";
import {
  DEFAULT_MIN_CONTRAST_RATIO,
  MIN_CONTRAST_RATIO,
  MAX_CONTRAST_RATIO,
  normalizeContrastRatio,
} from "./contrast-ratio";

describe("normalizeContrastRatio", () => {
  it("uses the VS Code default of 4.5 and the xterm range 1 to 21", () => {
    expect(DEFAULT_MIN_CONTRAST_RATIO).toBe(4.5);
    expect(MIN_CONTRAST_RATIO).toBe(1);
    expect(MAX_CONTRAST_RATIO).toBe(21);
  });

  it("passes in-range values through", () => {
    expect(normalizeContrastRatio(1)).toBe(1);
    expect(normalizeContrastRatio(4.5)).toBe(4.5);
    expect(normalizeContrastRatio(7)).toBe(7);
    expect(normalizeContrastRatio(21)).toBe(21);
  });

  it("clamps out-of-range values to 1 and 21", () => {
    expect(normalizeContrastRatio(0)).toBe(1);
    expect(normalizeContrastRatio(-3)).toBe(1);
    expect(normalizeContrastRatio(22)).toBe(21);
    expect(normalizeContrastRatio(1000)).toBe(21);
  });

  it("rounds to one decimal so float slider noise is not persisted", () => {
    expect(normalizeContrastRatio(4.5000000001)).toBe(4.5);
    expect(normalizeContrastRatio(6.96)).toBe(7);
    expect(normalizeContrastRatio(3.14159)).toBe(3.1);
  });

  it("falls back to the default for non-numeric or non-finite input", () => {
    expect(normalizeContrastRatio(NaN)).toBe(4.5);
    expect(normalizeContrastRatio(Infinity)).toBe(4.5);
    expect(normalizeContrastRatio(undefined)).toBe(4.5);
    expect(normalizeContrastRatio(null)).toBe(4.5);
    expect(normalizeContrastRatio("7")).toBe(4.5);
  });
});
