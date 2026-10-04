/**
 * xterm.js `minimumContrastRatio` (issue #106). xterm accepts 1 to 21; 1 turns
 * contrast correction off. The default matches VS Code's integrated terminal so
 * grey and dim (SGR 2) text stays readable on dark themes.
 */
export const DEFAULT_MIN_CONTRAST_RATIO = 4.5;
export const MIN_CONTRAST_RATIO = 1;
export const MAX_CONTRAST_RATIO = 21;

/** Clamps to 1-21 and rounds to one decimal; anything non-numeric falls back to the default. */
export function normalizeContrastRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MIN_CONTRAST_RATIO;
  const clamped = Math.min(MAX_CONTRAST_RATIO, Math.max(MIN_CONTRAST_RATIO, value));
  return Math.round(clamped * 10) / 10;
}
