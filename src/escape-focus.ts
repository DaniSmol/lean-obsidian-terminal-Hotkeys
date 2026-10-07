/**
 * Keeps keyboard focus in the terminal when Escape is pressed (issue #97).
 *
 * Obsidian handles Escape in a capture-phase listener on `window`, before any
 * plugin or xterm listener, and responds by moving focus out of the terminal
 * leaf. So stopping propagation from xterm's key handler is too late. Instead
 * of fighting that ordering we leave the event alone (xterm still receives the
 * ESC byte, and wiki-link autocomplete still dismisses on it) and re-assert
 * focus afterwards if Obsidian took it away.
 *
 * Free of Obsidian imports so it can be unit-tested with plain fakes.
 */

export interface EscapeKeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

export function isPlainEscape(e: EscapeKeyLike): boolean {
  return (
    e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !e.isComposing
  );
}

export interface EscapeFocusOptions {
  event: EscapeKeyLike;
  /** The "keep focus in terminal on Escape" setting. */
  enabled: boolean;
  /** True while keyboard focus is still inside this terminal view. */
  hasFocus: () => boolean;
  /** Re-activates this view's leaf and refocuses its terminal. */
  restore: () => void;
  /** Runs a callback right after the current listener returns (a microtask). */
  deferSoon: (fn: () => void) => void;
  /** Runs a callback a little later (an animation frame), for focus moved on the next tick. */
  deferLater: (fn: () => void) => void;
}

/**
 * Called from a capture-phase keydown listener on the view. Checks twice - right
 * after the current listener returns and again a frame later - because Obsidian
 * may move focus synchronously or on the next frame. Restores at most once.
 */
export function handleEscapeKey(opts: EscapeFocusOptions): void {
  if (!opts.enabled || !isPlainEscape(opts.event)) return;

  let restored = false;
  const check = (): void => {
    if (restored || opts.hasFocus()) return;
    restored = true;
    opts.restore();
  };
  opts.deferSoon(check);
  opts.deferLater(check);
}
