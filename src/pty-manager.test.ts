import { describe, it, expect } from "vitest";
import {
  shouldEnableConptyDll,
  repairConptyLayout,
  resolveWindowsStorePwshAlias,
  pickDefaultWindowsShell,
} from "./pty-manager";
import type { ChildProcessApi, FsApi, PathApi } from "./node-api";

// shouldEnableConptyDll only touches existsSync and path.join, so an
// in-memory fake is enough - no real filesystem or Electron needed.
function fakeFs(files: Set<string>): FsApi {
  return {
    existsSync: (p: string) => files.has(p),
  } as unknown as FsApi;
}

const posixPath: PathApi = {
  join: (...parts: string[]) => parts.join("/"),
  isAbsolute: (p: string) => p.startsWith("/"),
  sep: "/",
};

const NODE_PTY_DIR = "/plugin/node_modules/node-pty";

// node-pty's native loader resolves conpty.dll / OpenConsole.exe relative to
// the directory holding conpty.node, i.e. prebuilds/<platform>-<arch>/conpty/.
const conptyDir = (arch: string) => `${NODE_PTY_DIR}/prebuilds/win32-${arch}/conpty`;
const conptyFiles = (arch: string) => [
  `${conptyDir(arch)}/conpty.dll`,
  `${conptyDir(arch)}/OpenConsole.exe`,
];

describe("shouldEnableConptyDll", () => {
  it("returns false on non-Windows platforms", () => {
    const fs = fakeFs(new Set());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "darwin", "x64")).toBe(false);
  });

  it("returns false for unsupported Windows architectures", () => {
    const fs = fakeFs(new Set());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "ia32")).toBe(false);
  });

  it("returns false when prebuilds/<arch>/conpty is absent", () => {
    const fs = fakeFs(new Set());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });

  it("returns false when only one of conpty.dll / OpenConsole.exe exists", () => {
    const fs = fakeFs(new Set([`${conptyDir("x64")}/conpty.dll`]));
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(false);
  });

  it("returns true when conpty.dll and OpenConsole.exe exist in prebuilds/<arch>/conpty", () => {
    const fsX64 = fakeFs(new Set(conptyFiles("x64")));
    expect(shouldEnableConptyDll(fsX64, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(true);
    const fsArm = fakeFs(new Set(conptyFiles("arm64")));
    expect(shouldEnableConptyDll(fsArm, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(true);
  });

  it("returns false for an arm64 host even when only x64 files are present", () => {
    const fs = fakeFs(new Set(conptyFiles("x64")));
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });

  it("returns false when existsSync throws (e.g. permission error)", () => {
    const fs: FsApi = {
      existsSync: () => {
        throw new Error("EACCES");
      },
    } as unknown as FsApi;
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(false);
  });

  // Regression for #105: the 1.4.0 win32-arm64 package shipped third_party/conpty
  // plus conpty.dll / OpenConsole.exe flat in prebuilds/win32-arm64/. The gate used
  // to pass on third_party alone, then node-pty failed to spawn with "Cannot find
  // conpty.dll at <...>/prebuilds/win32-arm64/conpty/conpty.dll".
  it("returns false for the 1.4.0 arm64 layout (third_party + flat prebuilds, no conpty/ subdir)", () => {
    const tp = `${NODE_PTY_DIR}/third_party/conpty/1.23.251008001/win10-arm64`;
    const flat = `${NODE_PTY_DIR}/prebuilds/win32-arm64`;
    const fs = fakeFs(
      new Set([
        `${tp}/conpty.dll`,
        `${tp}/OpenConsole.exe`,
        `${flat}/conpty.dll`,
        `${flat}/OpenConsole.exe`,
      ])
    );
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });
});

// Mutable in-memory fs for repairConptyLayout: tracks files, records copies.
function writableFs(initial: string[]) {
  const files = new Set(initial);
  const copies: Array<[string, string]> = [];
  const fs = {
    existsSync: (p: string) => files.has(p),
    mkdirSync: () => {},
    copyFileSync: (src: string, dest: string) => {
      if (!files.has(src)) throw new Error(`ENOENT: ${src}`);
      files.add(dest);
      copies.push([src, dest]);
    },
  } as unknown as FsApi;
  return { fs, copies };
}

describe("repairConptyLayout", () => {
  const flatDir = `${NODE_PTY_DIR}/prebuilds/win32-arm64`;
  const flat = [`${flatDir}/conpty.dll`, `${flatDir}/OpenConsole.exe`];

  // Regression for #105: installs from the 1.4.0 win32-arm64 zip have the files
  // flat; repairing them must make the gate pass without a re-download.
  it("copies flat conpty.dll/OpenConsole.exe into conpty/ so the gate passes", () => {
    const { fs, copies } = writableFs(flat);
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);

    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(true);

    expect(copies).toEqual([
      [`${flatDir}/conpty.dll`, `${conptyDir("arm64")}/conpty.dll`],
      [`${flatDir}/OpenConsole.exe`, `${conptyDir("arm64")}/OpenConsole.exe`],
    ]);
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(true);
  });

  it("is a no-op when the conpty/ layout is already correct", () => {
    const { fs, copies } = writableFs(conptyFiles("x64"));
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(false);
    expect(copies).toEqual([]);
  });

  it("only copies the file that is missing from a partial conpty/ dir", () => {
    const { fs, copies } = writableFs([...flat, `${conptyDir("arm64")}/conpty.dll`]);
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(true);
    expect(copies).toEqual([
      [`${flatDir}/OpenConsole.exe`, `${conptyDir("arm64")}/OpenConsole.exe`],
    ]);
  });

  it("does nothing when the flat files are absent (nothing to repair from)", () => {
    const { fs, copies } = writableFs([]);
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
    expect(copies).toEqual([]);
  });

  it("does nothing on non-Windows platforms or unsupported architectures", () => {
    const { fs, copies } = writableFs(flat);
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "darwin", "arm64")).toBe(false);
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "ia32")).toBe(false);
    expect(copies).toEqual([]);
  });

  it("never throws and returns false when the copy fails (e.g. read-only dir)", () => {
    const fs = {
      existsSync: (p: string) => flat.includes(p),
      mkdirSync: () => {},
      copyFileSync: () => {
        throw new Error("EACCES");
      },
    } as unknown as FsApi;
    expect(repairConptyLayout(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });
});

describe("resolveWindowsStorePwshAlias", () => {
  const alias = "C:\\Users\\Test\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";
  const installed = "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\\pwsh.exe";

  it("uses the installed package executable instead of the Store app execution alias", () => {
    const fs = {
      statSync: (path: string) => ({ isFile: () => path === installed }),
    } as unknown as FsApi;
    const childProcess = {
      execFileSync: () => `${installed}\r\n${alias}\r\n`,
    } as unknown as ChildProcessApi;

    expect(resolveWindowsStorePwshAlias(alias, fs, childProcess)).toBe(installed);
  });

  it("finds the installed Store package when where.exe only returns the alias", () => {
    const installLocation = installed.slice(0, -"\\pwsh.exe".length);
    const fs = {
      statSync: (path: string) => ({ isFile: () => path === installed }),
    } as unknown as FsApi;
    const childProcess = {
      execFileSync: (file: string) => file === "where.exe" ? `${alias}\r\n` : installLocation,
    } as unknown as ChildProcessApi;

    expect(resolveWindowsStorePwshAlias(alias, fs, childProcess)).toBe(installed);
  });

  it("does not change a normal PowerShell path", () => {
    const fs = {} as FsApi;
    const childProcess = {} as ChildProcessApi;
    const normalPath = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";

    expect(resolveWindowsStorePwshAlias(normalPath, fs, childProcess)).toBe(normalPath);
  });

  it("leaves the alias unchanged when no usable package executable is found", () => {
    const fs = {
      statSync: () => {
        throw Object.assign(new Error("Access denied"), { code: "EACCES" });
      },
    } as unknown as FsApi;
    const childProcess = {
      execFileSync: () => `${alias}\r\n`,
    } as unknown as ChildProcessApi;

    expect(resolveWindowsStorePwshAlias(alias, fs, childProcess)).toBe(alias);
  });
});

describe("pickDefaultWindowsShell", () => {
  const env = {
    ProgramFiles: "C:\\Program Files",
    LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local",
    SystemRoot: "C:\\Windows",
    COMSPEC: "C:\\Windows\\System32\\cmd.exe",
  };
  const standard = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const alias = "C:\\Users\\Test\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";
  const installed = "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\\pwsh.exe";
  const winPs = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

  function fsWith(files: string[]): FsApi {
    return {
      existsSync: (p: string) => files.includes(p),
      statSync: (p: string) => ({ isFile: () => files.includes(p) }),
    } as unknown as FsApi;
  }
  function recordingChildProcess(output: string): { cp: ChildProcessApi; calls: string[] } {
    const calls: string[] = [];
    const cp = {
      execFileSync: (file: string) => {
        calls.push(file);
        return output;
      },
    } as unknown as ChildProcessApi;
    return { cp, calls };
  }

  it("runs no child process when neither PowerShell 7 path exists", () => {
    const { cp, calls } = recordingChildProcess("");
    expect(pickDefaultWindowsShell(env, fsWith([winPs]), cp)).toBe(winPs);
    expect(calls).toEqual([]);
  });

  it("falls back to COMSPEC when no PowerShell exists, without running a child process", () => {
    const { cp, calls } = recordingChildProcess("");
    expect(pickDefaultWindowsShell(env, fsWith([]), cp)).toBe(env.COMSPEC);
    expect(calls).toEqual([]);
  });

  it("prefers the standard PowerShell 7 install without running a child process", () => {
    const { cp, calls } = recordingChildProcess("");
    expect(pickDefaultWindowsShell(env, fsWith([standard, alias, winPs]), cp)).toBe(standard);
    expect(calls).toEqual([]);
  });

  it("resolves the Store alias to the installed package executable", () => {
    const { cp } = recordingChildProcess(`${installed}\r\n${alias}\r\n`);
    expect(pickDefaultWindowsShell(env, fsWith([alias, installed, winPs]), cp)).toBe(installed);
  });

  it("falls back to Windows PowerShell 5.1 when the Store alias cannot be resolved", () => {
    const { cp } = recordingChildProcess(`${alias}\r\n`);
    expect(pickDefaultWindowsShell(env, fsWith([alias, winPs]), cp)).toBe(winPs);
  });
});
