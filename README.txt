Lean Terminal — with Hotkeys
============================

A fork of Lean Terminal by sdkasper, the embedded terminal panel for Obsidian (powered by
xterm.js + node-pty). It adds the terminal keyboard shortcuts that were missing
on Windows.

In the original plugin, Obsidian's own hotkeys would swallow common terminal
keys like Ctrl+K, and a couple of line-editing combos never reached the shell.
This fork makes the terminal claim its own keys first, so they behave the way
they do in a normal terminal.


What's added
------------
- Terminal line-editing keys now work: Ctrl+A, Ctrl+E, Ctrl+K, Ctrl+U, Ctrl+W,
  Ctrl+L, Ctrl+B, Ctrl+F, Ctrl+D, Ctrl+R. (Ctrl+C / Ctrl+V copy/paste are left
  alone.)
- Ctrl+Shift+Enter (and Shift+Enter) insert a newline at the cursor instead of
  running the command — useful for multi-line input.
- Falls back to Windows PowerShell 5.1 when PowerShell 7 isn't installed, instead
  of cmd.exe (which has no line editing at all).
- Sets up bash-style line editing in PowerShell automatically.
- Fixes garbled prompt markers (e]133;...) that appeared under Windows
  PowerShell 5.1.

Everything else from the original plugin works the same.


Requirements
------------
Obsidian desktop on Windows. The hotkey behaviour is tuned for Windows +
PowerShell.


Installation
------------
This is a fork, so it isn't in Obsidian's Community Plugins browser. 
Install it via obsidian install with Gihub link or manually:

1. Get the plugin files: main.js, manifest.json and styles.css
   (from a release, or build them yourself — see "Building" below).

2. In your vault, create this folder and copy the three files into it:
     <your-vault>/.obsidian/plugins/lean-terminal-custom/

3. Restart Obsidian, then open
     Settings -> Community plugins
   turn off Restricted mode if needed, and enable "Lean Terminal - with Hotkeys".

4. Open the plugin's settings and click "Download binaries" the first time, to
   fetch the terminal engine (node-pty) for your machine.

Open a terminal from the ribbon icon or the command palette ("Open terminal").


Building from source
--------------------
   npm install
   npm run build

This produces main.js. Copy it along with manifest.json and styles.css into the
plugin folder from step 2.


Credits
-------
Based on Lean Terminal by sdkasper:
https://github.com/sdkasper/lean-obsidian-terminal
