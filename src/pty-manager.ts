import { Platform } from "obsidian";
import { getShellIntegration } from "./shell-integration";
import { requireNode, nodeProcess, type FsApi, type PathApi } from "./node-api";

interface IPtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitInfo: { exitCode: number; signal?: number }) => void): void;
  kill(): void;
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string | undefined>;
      useConpty?: boolean;
      useConptyDll?: boolean;
    }
  ): IPtyProcess;
}

function getNodePtyDir(pluginDir: string): string {
  const path = requireNode("path");
  return path.join(pluginDir, "node_modules", "node-pty");
}

// node-pty is loaded at runtime via Electron's require, not bundled by esbuild.
function loadNodePty(nodePtyDir: string): NodePtyModule {
  try {
    return window.require(nodePtyDir) as NodePtyModule;
  } catch {
    return window.require("node-pty") as NodePtyModule;
  }
}

// Windows architectures for which node-pty ships conpty.dll + OpenConsole.exe.
const CONPTY_ARCHES = new Set(["x64", "arm64"]);

/**
 * Decides whether it is safe to pass `useConptyDll: true` to node-pty's spawn.
 *
 * Context (see GitHub issue #92): on Windows 10, node-pty's default ConPTY
 * (the in-box conhost) does not forward mouse input to TUI apps. Passing
 * `useConptyDll: true` makes node-pty launch the modern OpenConsole.exe,
 * which does forward mouse input on both Windows 10 and 11.
 *
 * node-pty's native loader resolves conpty.dll and OpenConsole.exe relative
 * to conpty.node, i.e. `prebuilds/<platform>-<arch>/conpty/` - NOT the
 * `third_party/conpty/` source tree of the npm package. This plugin does not
 * bundle node-pty - it downloads a platform-specific zip from GitHub releases
 * at runtime (see binary-manager.ts), and some packages (the 1.4.0 win32-arm64
 * one, see issue #105) shipped the files flat in `prebuilds/<platform>-<arch>/`
 * or only under `third_party`. Enabling the flag without the files at the
 * exact path node-pty loads from makes spawn fail with "Cannot find
 * conpty.dll", so this check gates on that path existing on disk rather than
 * assuming it does.
 */
export function shouldEnableConptyDll(
  fs: FsApi,
  path: PathApi,
  nodePtyDir: string,
  platform: string,
  arch: string
): boolean {
  if (platform !== "win32") return false;

  if (!CONPTY_ARCHES.has(arch)) return false;

  const conptyDir = path.join(nodePtyDir, "prebuilds", `${platform}-${arch}`, "conpty");
  try {
    return (
      fs.existsSync(path.join(conptyDir, "conpty.dll")) &&
      fs.existsSync(path.join(conptyDir, "OpenConsole.exe"))
    );
  } catch {
    return false;
  }
}

const CONPTY_FILES = ["conpty.dll", "OpenConsole.exe"];

/**
 * Repairs the conpty layout of installs downloaded from the 1.4.0 win32-arm64
 * zip (issue #105): conpty.dll and OpenConsole.exe sit flat in
 * `prebuilds/<platform>-<arch>/` but node-pty loads them from the `conpty/`
 * subfolder next to conpty.node. Copies any missing file into `conpty/` so the
 * Windows 10 mouse fix (see shouldEnableConptyDll) works without a re-download
 * - re-downloading the 1.4.0 asset would reproduce the same flat layout.
 *
 * Best-effort and idempotent: never throws, never overwrites existing files,
 * and does nothing when the flat files are absent. Returns true when it
 * copied at least one file.
 */
export function repairConptyLayout(
  fs: FsApi,
  path: PathApi,
  nodePtyDir: string,
  platform: string,
  arch: string
): boolean {
  if (platform !== "win32" || !CONPTY_ARCHES.has(arch)) return false;

  try {
    const prebuildDir = path.join(nodePtyDir, "prebuilds", `${platform}-${arch}`);
    const conptyDir = path.join(prebuildDir, "conpty");
    let copied = false;
    for (const name of CONPTY_FILES) {
      const src = path.join(prebuildDir, name);
      const dest = path.join(conptyDir, name);
      if (fs.existsSync(dest) || !fs.existsSync(src)) continue;
      fs.mkdirSync(conptyDir, { recursive: true });
      fs.copyFileSync(src, dest);
      copied = true;
    }
    return copied;
  } catch {
    return false;
  }
}

function getDefaultShell(): string {
  if (Platform.isWin) {
    const pwshPaths = [
      nodeProcess.env.ProgramFiles + "\\PowerShell\\7\\pwsh.exe",                    // standard installer
      (nodeProcess.env.LOCALAPPDATA || "") + "\\Microsoft\\WindowsApps\\pwsh.exe",   // MS Store
    ];
    try {
      const fs = requireNode("fs");
      for (const p of pwshPaths) {
        if (p && fs.existsSync(p)) return p;
      }
    } catch {
      // ignore
    }
    return nodeProcess.env.COMSPEC || "cmd.exe";
  }
  return nodeProcess.env.SHELL || "/bin/bash";
}

function getShellArgs(shellPath: string): string[] {
  if (Platform.isWin) {
    const lower = shellPath.toLowerCase();
    if (lower.includes("pwsh") || lower.includes("powershell")) {
      return ["-NoLogo"];
    }
    return [];
  }
  // macOS/Linux: launch as login shell so ~/.zprofile, ~/.bash_profile etc.
  // are sourced and PATH includes Homebrew, nvm, user-installed CLIs.
  return ["-l"];
}

/**
 * Validates that a shell path points to an existing file.
 * Throws if the path does not exist or is not a file.
 */
function validateShellPath(shellPath: string): void {
  const fs = requireNode("fs");
  try {
    const stat = fs.statSync(shellPath);
    if (!stat.isFile()) {
      throw new Error(`Shell path is not a file: ${shellPath}`);
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new Error(`Shell not found: ${shellPath}`);
    }
    throw err;
  }
}

export class PtyManager {
  private ptyProcess: IPtyProcess | null = null;
  private nodePty: NodePtyModule | null = null;
  private pluginDir: string;
  private _shellPath: string = "";

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  get shellPath(): string {
    return this._shellPath;
  }

  spawn(
    shellPath: string,
    cwd: string,
    cols: number,
    rows: number,
    env?: Record<string, string>
  ): void {
    const nodePtyDir = getNodePtyDir(this.pluginDir);
    this.nodePty = loadNodePty(nodePtyDir);

    const shell = shellPath || getDefaultShell();
    this._shellPath = shell;
    validateShellPath(shell);
    const baseArgs = getShellArgs(shell);

    // Inject shell integration hooks
    const si = getShellIntegration(shell, this.pluginDir);
    const args = si.args.length > 0 ? si.args : baseArgs;

    const ptyEnv = {
      ...nodeProcess.env,
      ...si.env,
      ...env,
    };

    // useConptyDll enables node-pty's bundled OpenConsole.exe instead of the
    // in-box conhost ConPTY. On Windows 10 the in-box conhost does not
    // forward mouse input (clicks/wheel) to TUI apps - see issue #92. Only
    // enabled when conpty.dll and OpenConsole.exe exist where node-pty loads
    // them from, prebuilds/<platform>-<arch>/conpty/ (see shouldEnableConptyDll
    // doc comment above).
    const nodeFs = requireNode("fs");
    const nodePath = requireNode("path");
    // Heal installs from the 1.4.0 win32-arm64 zip first (issue #105).
    repairConptyLayout(nodeFs, nodePath, nodePtyDir, nodeProcess.platform, nodeProcess.arch);
    const useConptyDll = shouldEnableConptyDll(
      nodeFs,
      nodePath,
      nodePtyDir,
      nodeProcess.platform,
      nodeProcess.arch
    );

    this.ptyProcess = this.nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: ptyEnv,
      // ConPTY with patched ConoutConnection (inline socket piping, no Worker threads).
      // useConpty defaults to true on Windows — ConPTY has correct UTF-8/emoji support.
      // Fallback: set useConpty: false here if ConPTY deadlocks on your Electron build.
      ...(useConptyDll ? { useConptyDll: true } : {}),
    });
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    try {
      this.ptyProcess?.resize(cols, rows);
    } catch {
      // Ignore resize errors (can happen during rapid resizing)
    }
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess?.onData(callback);
  }

  onExit(callback: (exitInfo: { exitCode: number; signal?: number }) => void): void {
    this.ptyProcess?.onExit(callback);
  }

  kill(): void {
    try {
      this.ptyProcess?.kill();
    } catch {
      // Process may already be dead
    }
    this.ptyProcess = null;
  }

}
