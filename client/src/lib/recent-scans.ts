// The last few scans, remembered in this browser only (the server keeps reports in memory,
// so an old report may be gone: the UI then just scans the same address again).

const STORAGE_KEY = 'qa-recent-scans';
const MAX_ENTRIES = 6;

export interface RecentScan {
  id: string;
  url: string;
  createdAt: string;
  score: number;
  critical: number;
}

export function loadRecentScans(): RecentScan[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentScan[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentScan(entry: RecentScan): RecentScan[] {
  const next = [entry, ...loadRecentScans().filter((scan) => scan.id !== entry.id && scan.url !== entry.url)].slice(
    0,
    MAX_ENTRIES,
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage disabled: the list simply isn't remembered.
  }
  return next;
}

/** Removes one scan from the list and returns what is left. */
export function removeRecentScan(id: string): RecentScan[] {
  const next = loadRecentScans().filter((scan) => scan.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled: the change only lasts until the page is reloaded.
  }
  return next;
}

export function clearRecentScans(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
