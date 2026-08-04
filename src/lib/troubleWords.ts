// "Palavras difíceis" — trouble words collected by the pronunciation coach.
// Every close/off verdict in Chat lands here; practice results feed mastery.
// Stored in localStorage, following the gamify.ts pattern.

import { normalizePt } from "./speech";
import type { PronFeedback } from "./pronunciation";

const KEY = "pt_trouble_words_v1";
const MAX_WORDS = 80;
/** Passes (score ≥ 80) needed for a word to count as mastered. */
export const MASTERED_PASSES = 3;

export interface TroubleWord {
  /** Correct Portuguese form — also the identity key (normalized). */
  word: string;
  /** Hyphenated syllables with stressed syllable in caps, e.g. "o-bri-GA-du". */
  slowForm: string;
  /** The articulation tip the coach gave when the word was flagged. */
  tip: string;
  /** What the recognizer heard when the word was flagged. */
  heardAs: string;
  addedAt: number;
  attempts: number;
  /** Attempts scoring ≥ 80. */
  passes: number;
  lastScore: number | null;
}

function read(): TroubleWord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as TroubleWord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: TroubleWord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable — coaching continues regardless */
  }
}

function keyOf(word: string): string {
  return normalizePt(word);
}

export function getTroubleWords(): TroubleWord[] {
  return read();
}

export function isMastered(w: TroubleWord): boolean {
  return w.passes >= MASTERED_PASSES;
}

/** Words still needing practice, oldest-flagged first. */
export function activeTroubleWords(): TroubleWord[] {
  return read()
    .filter((w) => !isMastered(w))
    .sort((a, b) => a.addedAt - b.addedAt);
}

/** Upsert from a coaching verdict. Refreshes tip/heardAs on repeat offenses. */
export function saveTroubleWord(feedback: PronFeedback): void {
  const word = feedback.focusWord.trim();
  if (!word) return;
  const list = read();
  const key = keyOf(word);
  const existing = list.find((w) => keyOf(w.word) === key);
  if (existing) {
    if (feedback.tip) existing.tip = feedback.tip;
    if (feedback.slowForm) existing.slowForm = feedback.slowForm;
    if (feedback.heardAs) existing.heardAs = feedback.heardAs;
  } else {
    list.push({
      word,
      slowForm: feedback.slowForm,
      tip: feedback.tip,
      heardAs: feedback.heardAs,
      addedAt: Date.now(),
      attempts: 0,
      passes: 0,
      lastScore: null,
    });
  }
  // Evict mastered-first, then oldest, when over capacity.
  while (list.length > MAX_WORDS) {
    const masteredIdx = list.findIndex(isMastered);
    list.splice(masteredIdx >= 0 ? masteredIdx : 0, 1);
  }
  write(list);
}

/** Record one practice attempt; returns the updated list for UI refresh. */
export function recordPractice(word: string, score: number): TroubleWord[] {
  const list = read();
  const entry = list.find((w) => keyOf(w.word) === keyOf(word));
  if (entry) {
    entry.attempts += 1;
    if (score >= 80) entry.passes += 1;
    entry.lastScore = score;
    write(list);
  }
  return list;
}

export function removeTroubleWord(word: string): TroubleWord[] {
  const key = keyOf(word);
  const list = read().filter((w) => keyOf(w.word) !== key);
  write(list);
  return list;
}
