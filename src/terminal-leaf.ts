/**
 * Picks which terminal pane a command (next/previous/first/last/N tab,
 * "New terminal tab") should act on when several terminal panes are open.
 *
 * Kept free of Obsidian imports so it can be unit-tested with plain fakes.
 */

interface LeafLike {
  view: { containerEl: { contains(other: never): boolean } };
}

/**
 * Preference order:
 *  1. the pane that holds keyboard focus (the xterm textarea is inside its container)
 *  2. the pane whose view is the workspace's active terminal view
 *  3. the first pane (the pre-#104 behaviour, so single-pane setups are unchanged)
 */
export function pickTerminalLeaf<L extends LeafLike>(
  leaves: L[],
  focused: unknown,
  activeView: unknown
): L | null {
  if (leaves.length === 0) return null;
  const hasFocus = (leaf: L): boolean =>
    focused !== null && focused !== undefined && leaf.view.containerEl.contains(focused as never);
  return (
    leaves.find(hasFocus) ??
    (activeView ? leaves.find((l) => l.view === activeView) : undefined) ??
    leaves[0]
  );
}
