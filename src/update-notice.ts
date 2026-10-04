/**
 * Update notice: a one-time modal after a minor or major update that thanks
 * the user and links to the support page. Pure version logic lives here so
 * it can be unit-tested without Obsidian. The modal itself is in
 * update-notice-modal.ts.
 */

export const SUPPORT_URL = "https://kspr.me/cheers";

function parseMajorMinor(version: string): [number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/** Last minor before the notice existed; stands in for users with saved data but no stored version. */
const PRE_NOTICE_VERSION = "1.4.0";

/**
 * The version to compare against. A stored version wins. With none stored,
 * a fresh install (no saved data) stays empty so nothing shows, while an
 * existing install predates the notice and is compared against 1.4.0.
 */
export function resolveLastSeen(stored: string | undefined, hadSavedData: boolean): string {
  if (stored) return stored;
  return hadSavedData ? PRE_NOTICE_VERSION : "";
}

/**
 * True when `current` is a higher minor or major version than `lastSeen`.
 * Empty `lastSeen` (fresh install), patch bumps, downgrades and malformed
 * versions all return false.
 */
export function shouldShowNotice(lastSeen: string, current: string): boolean {
  const seen = parseMajorMinor(lastSeen);
  const now = parseMajorMinor(current);
  if (!seen || !now) return false;
  return now[0] > seen[0] || (now[0] === seen[0] && now[1] > seen[1]);
}
