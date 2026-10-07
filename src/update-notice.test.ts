import { describe, it, expect } from "vitest";
import { resolveLastSeen, shouldShowNotice, SUPPORT_URL } from "./update-notice";

describe("shouldShowNotice", () => {
  it("stays silent on a fresh install (nothing seen yet)", () => {
    expect(shouldShowNotice("", "1.5.0")).toBe(false);
  });

  it("stays silent when the version did not change", () => {
    expect(shouldShowNotice("1.5.0", "1.5.0")).toBe(false);
  });

  it("stays silent on a patch bump", () => {
    expect(shouldShowNotice("1.4.0", "1.4.1")).toBe(false);
    expect(shouldShowNotice("1.5.0", "1.5.7")).toBe(false);
  });

  it("shows on a minor bump", () => {
    expect(shouldShowNotice("1.4.1", "1.5.0")).toBe(true);
    expect(shouldShowNotice("1.4.9", "1.6.2")).toBe(true);
  });

  it("shows on a major bump", () => {
    expect(shouldShowNotice("1.9.3", "2.0.0")).toBe(true);
  });

  it("stays silent on a downgrade", () => {
    expect(shouldShowNotice("1.5.0", "1.4.1")).toBe(false);
    expect(shouldShowNotice("2.0.0", "1.9.9")).toBe(false);
  });

  it("stays silent on malformed versions instead of throwing", () => {
    expect(shouldShowNotice("garbage", "1.5.0")).toBe(false);
    expect(shouldShowNotice("1.4.1", "")).toBe(false);
    expect(shouldShowNotice("1.4", "1.5.0")).toBe(false);
  });
});

describe("resolveLastSeen", () => {
  it("keeps a stored version", () => {
    expect(resolveLastSeen("1.4.1", true)).toBe("1.4.1");
    expect(resolveLastSeen("1.4.1", false)).toBe("1.4.1");
  });

  it("returns empty for a fresh install with no saved data", () => {
    expect(resolveLastSeen("", false)).toBe("");
    expect(resolveLastSeen(undefined, false)).toBe("");
  });

  it("treats existing users without a stored version as pre-notice installs", () => {
    expect(shouldShowNotice(resolveLastSeen(undefined, true), "1.5.0")).toBe(true);
    expect(shouldShowNotice(resolveLastSeen("", true), "1.4.2")).toBe(false);
  });
});

describe("SUPPORT_URL", () => {
  it("points at the LeanProductivity donate page", () => {
    expect(SUPPORT_URL).toBe("https://kspr.me/cheers");
  });
});
