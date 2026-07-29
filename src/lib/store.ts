// localStorage-backed progress + SRS (SM-2-lite) store

const SRS_KEY = "pt_srs_v1";
const PROGRESS_KEY = "pt_progress_v1";

export interface SrsState {
  box: number; // 0..6
  due: number; // epoch ms
  reps: number;
}

export type Rating = "again" | "hard" | "good" | "easy";

const INTERVALS = [
  10 * 60 * 1000, // 10 min
  24 * 3600 * 1000, // 1 day
  2 * 24 * 3600 * 1000,
  4 * 24 * 3600 * 1000,
  7 * 24 * 3600 * 1000,
  15 * 24 * 3600 * 1000,
  30 * 24 * 3600 * 1000,
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function getSrs(): Record<string, SrsState> {
  return read(SRS_KEY, {});
}

export function rateCard(cardId: string, rating: Rating): Record<string, SrsState> {
  const srs = getSrs();
  const cur = srs[cardId] ?? { box: 0, due: 0, reps: 0 };
  let box = cur.box;
  if (rating === "again") box = 0;
  else if (rating === "hard") box = Math.max(0, box - 1);
  else if (rating === "good") box = Math.min(INTERVALS.length - 1, box + 1);
  else box = Math.min(INTERVALS.length - 1, box + 2);
  const delay = rating === "hard" ? INTERVALS[Math.max(0, box)] / 2 : INTERVALS[box];
  srs[cardId] = { box, due: Date.now() + delay, reps: cur.reps + 1 };
  write(SRS_KEY, srs);
  return srs;
}

export function dueCount(allCardIds: string[]): number {
  const srs = getSrs();
  const now = Date.now();
  return allCardIds.filter((id) => !srs[id] || srs[id].due <= now).length;
}

export function learnedCount(allCardIds: string[]): number {
  const srs = getSrs();
  return allCardIds.filter((id) => srs[id] && srs[id].reps > 0).length;
}

export interface Progress {
  completedLessons: string[];
  quizScores: Record<string, number>; // lessonId -> best pct
  lessonVisits: Record<string, number>;
}

export function getProgress(): Progress {
  return read(PROGRESS_KEY, { completedLessons: [], quizScores: {}, lessonVisits: {} });
}

export function markLessonComplete(lessonId: string): Progress {
  const p = getProgress();
  if (!p.completedLessons.includes(lessonId)) p.completedLessons.push(lessonId);
  write(PROGRESS_KEY, p);
  return p;
}

export function recordQuizScore(lessonId: string, pct: number): Progress {
  const p = getProgress();
  p.quizScores[lessonId] = Math.max(p.quizScores[lessonId] ?? 0, pct);
  write(PROGRESS_KEY, p);
  return p;
}

export function recordLessonVisit(lessonId: string): Progress {
  const p = getProgress();
  p.lessonVisits[lessonId] = (p.lessonVisits[lessonId] ?? 0) + 1;
  write(PROGRESS_KEY, p);
  return p;
}

// ---- mission check-offs ----

const MISSIONS_KEY = "pt_missions_v1";

export function getMissionsDone(): string[] {
  return read(MISSIONS_KEY, []);
}

export function toggleMission(id: string): string[] {
  const done = getMissionsDone();
  const next = done.includes(id) ? done.filter((m) => m !== id) : [...done, id];
  write(MISSIONS_KEY, next);
  return next;
}

// ---- anime tracker ----

const ANIME_KEY = "pt_anime_v1";

export interface AnimeEntry {
  id: string;
  title: string;
  episode: string;
  date: string;
  comprehension: number;
  phrases: string;
}

export function getAnimeLog(): AnimeEntry[] {
  return read(ANIME_KEY, []);
}

export function addAnimeEntry(e: AnimeEntry): AnimeEntry[] {
  const list = getAnimeLog();
  list.unshift(e);
  if (list.length > 200) list.length = 200;
  write(ANIME_KEY, list);
  return list;
}

export function deleteAnimeEntry(id: string): AnimeEntry[] {
  const list = getAnimeLog().filter((e) => e.id !== id);
  write(ANIME_KEY, list);
  return list;
}
