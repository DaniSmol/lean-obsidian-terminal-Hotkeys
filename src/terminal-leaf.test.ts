import { describe, it, expect } from "vitest";
import { pickTerminalLeaf } from "./terminal-leaf";

// pickTerminalLeaf only needs leaf.view.containerEl.contains(node), so tiny
// fakes are enough - no Obsidian workspace or DOM required.
interface FakeNode {
  id: string;
}

function fakeLeaf(name: string, children: FakeNode[]) {
  return {
    name,
    view: {
      containerEl: {
        contains: (n: FakeNode | null) => n !== null && children.includes(n),
      },
    },
  };
}

describe("pickTerminalLeaf", () => {
  const xtermA: FakeNode = { id: "xterm-textarea-A" };
  const xtermB: FakeNode = { id: "xterm-textarea-B" };
  const editor: FakeNode = { id: "note-editor" };

  // Regression for #104: prev/next/first/last/N tab commands and "New terminal tab"
  // always acted on the first terminal leaf in workspace order.
  it("returns the pane that holds keyboard focus, not the first pane", () => {
    const a = fakeLeaf("A", [xtermA]);
    const b = fakeLeaf("B", [xtermB]);
    expect(pickTerminalLeaf([a, b], xtermB, null)).toBe(b);
    expect(pickTerminalLeaf([a, b], xtermA, null)).toBe(a);
  });

  it("falls back to the active terminal view's leaf when focus is outside every pane", () => {
    const a = fakeLeaf("A", [xtermA]);
    const b = fakeLeaf("B", [xtermB]);
    expect(pickTerminalLeaf([a, b], editor, b.view)).toBe(b);
  });

  it("prefers the focused pane over the active view", () => {
    const a = fakeLeaf("A", [xtermA]);
    const b = fakeLeaf("B", [xtermB]);
    expect(pickTerminalLeaf([a, b], xtermA, b.view)).toBe(a);
  });

  it("falls back to the first pane when nothing is focused or active (previous behaviour)", () => {
    const a = fakeLeaf("A", [xtermA]);
    const b = fakeLeaf("B", [xtermB]);
    expect(pickTerminalLeaf([a, b], null, null)).toBe(a);
    expect(pickTerminalLeaf([a, b], editor, null)).toBe(a);
  });

  it("returns null when there are no terminal panes", () => {
    expect(pickTerminalLeaf([], xtermA, null)).toBeNull();
  });
});
