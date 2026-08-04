// Custom vocabulary cards saved from session reports.
// Merged into the Review "Phrases" deck alongside the bundled vocab.

import { normalizePt } from "./speech";

const KEY = "pt_custom_cards_v1";
const MAX_CARDS = 200;

export interface CustomCard {
  id: string;
  pt: string;
  en: string;
  addedAt: number;
  /** Session report this card came from, for traceability. */
  reportId?: string;
}

export function getCustomCards(): CustomCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CustomCard[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: CustomCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CARDS)));
  } catch {
    /* ignore */
  }
}

/** Add vocab items from a report; skips duplicates. Returns how many were new. */
export function addCustomCards(items: { pt: string; en: string }[], reportId?: string): number {
  const list = getCustomCards();
  const existing = new Set(list.map((c) => normalizePt(c.pt)));
  let added = 0;
  for (const item of items) {
    const pt = item.pt.trim();
    const en = item.en.trim();
    if (!pt || !en) continue;
    const key = normalizePt(pt);
    if (!key || existing.has(key)) continue;
    existing.add(key);
    list.unshift({
      id: `c-${Date.now().toString(36)}-${added}`,
      pt,
      en,
      addedAt: Date.now(),
      reportId,
    });
    added += 1;
  }
  if (added > 0) write(list);
  return added;
}

export function removeCustomCard(id: string): CustomCard[] {
  const list = getCustomCards().filter((c) => c.id !== id);
  write(list);
  return list;
}
