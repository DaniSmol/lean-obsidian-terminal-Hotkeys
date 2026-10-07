/**
 * Cleans a saved xterm buffer (from @xterm/addon-serialize) before it is replayed into
 * a fresh terminal on restore.
 *
 * Why this is needed:
 * - If a full-screen app (for example Claude Code) was showing when the buffer was saved,
 *   the text contains the alt-screen switch "ESC[?1049h ESC[H". Replaying it would leave
 *   the new terminal stuck in the alternate screen. It is turned into a plain line break
 *   instead, so the last frame prints as ordinary text under the history.
 * - Leftover private mode switches (alt screen, mouse tracking, bracketed paste, focus
 *   reporting) would be re-enabled in the new terminal. A restored mouse-tracking mode
 *   made typed input come out garbled, so all of them are stripped.
 * - Trailing relative cursor moves and attribute resets are dropped, so the cursor ends
 *   right after the last remembered line.
 * - The result ends with an attribute reset, a line break and "show cursor", so the new
 *   shell starts on a clean line below the restored history with a visible cursor.
 */
/* eslint-disable no-control-regex -- matching ESC-prefixed terminal sequences is the point */
export function sanitizeRestoredBuffer(saved: string): string {
  return (
    saved
      .replace("\x1b[?1049h\x1b[H", "\x1b[0m\r\n")
      .replace(/\x1b\[\?(?:1049|1047|47|100[0-6]|1015|2004|1004)[hl]/g, "")
      .replace(/(?:\x1b\[\d*[ABCD]|\x1b\[0m)+$/, "") +
    "\x1b[0m\r\n\x1b[?25h"
  );
}
/* eslint-enable no-control-regex -- end of terminal sequence matching */
